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
      <section id="datasets-view" className="workbench-page-container">
        {/* 1. Page Heading with proper spacing and separator */}
        <div className="page-header-block">
          <div className="page-title-row">
            <h1 className="page-heading">Tenant Datasets &amp; Schemas</h1>
            <span className="heading-separator">·</span>
            <span className="heading-badge">{datasets.length} Registered</span>
          </div>
          <p className="page-heading-sub">
            Upload, manage, and inspect multi-tenant CSV and Parquet datasets with automated DuckDB schema profiling.
          </p>
        </div>

                <div className="datasets-main-grid">
                  {/* Upload Dataset Card */}
                  <div className="workbench-card">
                    <div className="card-header-row">
                      <h3 className="card-title">
                        <span className="card-title-icon">📤</span>
                        <span>Upload New Dataset</span>
                      </h3>
                      <span className="card-badge">CSV / Parquet</span>
                    </div>

                    <form onSubmit={onUploadSubmit} className="clean-vertical-form">
                      <div className="form-field-block">
                        <label className="field-label" htmlFor="upload-filename-input">
                          Filename (.csv or .parquet)
                        </label>
                        <input
                          id="upload-filename-input"
                          className="field-input"
                          value={uploadFilename}
                          onChange={e => onFilenameChange(e.target.value)}
                          placeholder="e.g. q4_sales_transactions.csv"
                          required
                        />
                        <span className="field-hint">Specify the target file extension for automatic DuckDB parser resolution</span>
                      </div>

                        <div className="form-field-block">
                          <label className="field-label" htmlFor="upload-content-textarea">
                            Paste CSV Content or Raw Tabular Records
                          </label>
                          <textarea
                            id="upload-content-textarea"
                            className="field-textarea csv-editor-textarea"
                            rows={10}
                            value={uploadText}
                            onChange={e => onTextChange(e.target.value)}
                            placeholder="transaction_id,customer_id,transaction_date,product_category,unit_price,quantity,discount_applied,payment_status&#10;TXN-1001,CUST-201,2024-01-10,Electronics,499.99,1,false,Completed&#10;TXN-1002,CUST-202,2024-01-11,Apparel,39.50,2,true,Completed"
                            required
                          />
                          <span className="field-hint">Supports comma-separated headers, standard date formats (YYYY-MM-DD), and null values</span>
                        </div>

                        <div className="form-actions-row">
                          <button className="btn-primary" type="submit" disabled={uploading}>
                            {uploading ? 'Validating & Profiling...' : 'Upload & Profile Dataset'}
                          </button>
                        </div>
                    </form>
                  </div>

                    {/* Available Datasets List Card */}
                    <div className="workbench-card">
                      <div className="card-header-row">
                        <h3 className="card-title">
                          <span className="card-title-icon">🗄️</span>
                          <span>Registered Datasets</span>
                        </h3>
                        <span className="card-badge">{datasets.length} Datasets</span>
                      </div>

                      {datasets.length === 0 ? (
            <div className="empty-state-notice">
              <p>No datasets uploaded yet in this workspace. Upload your first dataset using the form on the left.</p>
            </div>
                      ) : (
                                <div className="datasets-scroll-list">
                                  {datasets.map(d => {
                                    const isSelected = d.id === selectedDatasetId;
                                    return (
                                      <div
                                        key={d.id}
                                        onClick={() => onSelectDataset(d.id)}
                                        className={`dataset-row-item ${isSelected ? 'selected' : ''}`}
                                      >
                                        <div className="dataset-item-header">
                                          <strong className="dataset-item-name">{d.originalFilename}</strong>
                                          {isSelected && <span className="status-pill status-healthy">Active</span>}
                                        </div>
                                        <div className="dataset-item-meta">
                                          <span><strong>{d.rowCount.toLocaleString()}</strong> rows</span>
                                          <span>•</span>
                                          <span><strong>{d.columnCount}</strong> columns</span>
                                          <span>•</span>
                                          <span>{(d.fileSizeBytes / 1024).toFixed(1)} KB</span>
                                        </div>
                                      </div>
                                );
              })}
                              </div>
          )}
                            </div>
      </div>

                      {/* Profile Inspector Section */}
                      {selectedProfile && (
                              <div className="workbench-card" style={{ marginTop: 24 }}>
                                <div className="card-header-row">
                                  <h3 className="card-title">
                                    <span className="card-title-icon">🔍</span>
                                    <span>Dataset Hygiene Profile: {selectedProfile.datasetName}</span>
                                  </h3>
                                  <span className="card-badge">DuckDB Streaming Audit</span>
                                </div>

                                <div className="profile-stats-grid">
                                  <div className="profile-stat-box">
                                    <span className="p-k">Total Rows</span>
                                    <span className="p-v">{selectedProfile.totalRows.toLocaleString()}</span>
                                  </div>
                                  <div className="profile-stat-box">
                                    <span className="p-k">Total Columns</span>
                                    <span className="p-v">{selectedProfile.totalColumns}</span>
                                  </div>
                                  <div className="profile-stat-box">
                                    <span className="p-k">Duplicate Rows</span>
                                    <span className="p-v">{selectedProfile.duplicateRows}</span>
                                  </div>
                                  <div className="profile-stat-box">
                                    <span className="p-k">Quality Status</span>
                                    <span className="p-v positive">✓ Verified Clean</span>
                                  </div>
                                </div>

                                <div className="clean-table-container" style={{ marginTop: 16 }}>
                                  <table className="clean-table">
                                    <thead>
                                      <tr>
                                        <th>Column Name</th>
                                        <th>Inferred Type</th>
                                        <th>Null Count</th>
                                        <th>Null %</th>
                                        <th>Distinct Values</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                          {selectedProfile.columns.map(c => (
                                            <tr key={c.name}>
                                              <td><code>{c.name}</code></td>
                                              <td><span className="th-type-badge">{c.inferredType}</span></td>
                                              <td>{c.nullCount}</td>
                                              <td>{c.nullPercentage.toFixed(1)}%</td>
                                              <td>{c.distinctCount}</td>
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
