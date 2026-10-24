/**
 * Print & Screen CSS Design Tokens and layout styles for Executive Reports.
 */
export function getReportStyles(): string {
  return `
    /* ==========================================================================
       Print & Screen Base Design Tokens
       ========================================================================== */
    :root {
      --primary: #0f172a;
      --primary-accent: #2563eb;
      --secondary: #475569;
      --text-main: #1e293b;
      --text-muted: #64748b;
      --bg-main: #ffffff;
      --bg-alt: #f8fafc;
      --bg-subtle: #f1f5f9;
      --border-light: #e2e8f0;
      --border-dark: #cbd5e1;
      --positive: #16a34a;
      --warning: #d97706;
      --negative: #dc2626;
      --neutral: #64748b;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: var(--text-main);
      background-color: var(--bg-main);
      line-height: 1.5;
      font-size: 13px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Page Setup */
    @page {
      size: A4;
      margin: 15mm 15mm 18mm 15mm;
      @bottom-right {
        content: "Page " counter(page);
        font-size: 9px;
        color: #94a3b8;
      }
    }

    @media screen {
      body {
        max-width: 900px;
        margin: 20px auto;
        padding: 30px;
        background: #f1f5f9;
      }
      .report-container {
        background: #ffffff;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        border-radius: 8px;
        padding: 40px;
      }
    }

    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .report-container {
        box-shadow: none;
        padding: 0;
      }
      .page-break-after {
        page-break-after: always;
        break-after: page;
      }
      .avoid-break {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }

    /* Typography */
    h1, h2, h3, h4 {
      color: var(--primary);
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    h1 { font-size: 24px; line-height: 1.25; margin-bottom: 6px; }
    h2 { font-size: 16px; margin-bottom: 12px; border-bottom: 2px solid var(--border-light); padding-bottom: 4px; }
    h3 { font-size: 14px; margin-bottom: 6px; }
    h4 { font-size: 12px; }

    p { margin-bottom: 8px; }

    /* Section Styling */
    .section {
      margin-bottom: 28px;
    }

    /* Cover / Header */
    .report-header {
      padding-bottom: 18px;
      margin-bottom: 24px;
      border-bottom: 3px solid var(--primary-accent);
    }
    .report-meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-top: 14px;
      background: var(--bg-alt);
      padding: 12px 16px;
      border-radius: 6px;
      border: 1px solid var(--border-light);
    }
    .meta-item .meta-label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--text-muted);
      letter-spacing: 0.04em;
    }
    .meta-item .meta-value {
      font-size: 12px;
      font-weight: 600;
      color: var(--primary);
      margin-top: 2px;
    }

    /* Executive Summary Box */
    .summary-card {
      background: #f8fafc;
      border-left: 4px solid var(--primary-accent);
      padding: 16px 20px;
      border-radius: 4px;
      margin-bottom: 18px;
    }
    .summary-headline {
      font-size: 14px;
      font-weight: 700;
      color: var(--primary);
      margin-bottom: 8px;
    }
    .takeaway-list {
      padding-left: 18px;
      margin-bottom: 10px;
    }
    .takeaway-list li {
      margin-bottom: 4px;
      color: var(--text-main);
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .kpi-card {
      background: #ffffff;
      border: 1px solid var(--border-light);
      border-radius: 6px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .kpi-label {
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
    }
    .kpi-val {
      font-size: 20px;
      font-weight: 800;
      color: var(--primary);
      margin: 4px 0;
    }
    .kpi-def {
      font-size: 10px;
      color: var(--secondary);
      line-height: 1.3;
    }
    .kpi-badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      margin-top: 4px;
      align-self: flex-start;
    }
    .badge-positive { background: #dcfce7; color: #15803d; }
    .badge-warning { background: #fef3c7; color: #b45309; }
    .badge-negative { background: #fee2e2; color: #b91c1c; }
    .badge-neutral { background: #f1f5f9; color: #475569; }

    /* Key Findings */
    .finding-card {
      border: 1px solid var(--border-light);
      border-radius: 6px;
      margin-bottom: 14px;
      background: #ffffff;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .finding-header {
      background: var(--bg-alt);
      padding: 8px 14px;
      border-bottom: 1px solid var(--border-light);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .finding-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--primary);
    }
    .finding-body {
      padding: 12px 14px;
    }
    .finding-segment {
      margin-bottom: 8px;
    }
    .segment-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 2px;
    }
    .label-fact { color: #2563eb; }
    .label-hypo { color: #7c3aed; }
    .label-act { color: #16a34a; }

    /* Tables */
    .report-table-wrapper {
      margin-bottom: 18px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 8px;
    }
    .report-table th, .report-table td {
      padding: 7px 10px;
      border: 1px solid var(--border-light);
      text-align: left;
    }
    .report-table th {
      background: var(--bg-alt);
      font-weight: 700;
      color: var(--primary);
    }
    .report-table tr:nth-child(even) td {
      background: #fafafa;
    }
    .table-caption {
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 4px;
      font-style: italic;
    }

    /* Charts */
    .chart-container {
      margin-bottom: 20px;
      border: 1px solid var(--border-light);
      border-radius: 6px;
      padding: 14px;
      background: #ffffff;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .chart-header {
      margin-bottom: 8px;
    }
    .chart-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--primary);
    }
    .chart-subtitle {
      font-size: 11px;
      color: var(--text-muted);
    }
    .report-svg-chart {
      width: 100%;
      height: auto;
      max-height: 240px;
      display: block;
    }
    .chart-caption {
      font-size: 10px;
      color: var(--secondary);
      margin-top: 6px;
      line-height: 1.35;
      font-style: italic;
    }

    /* Quality Scorecard */
    .scorecard-summary {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
      background: var(--bg-alt);
      padding: 10px 14px;
      border-radius: 6px;
      border: 1px solid var(--border-light);
    }
    .scorecard-metric {
      font-size: 12px;
    }
    .scorecard-metric strong {
      color: var(--primary);
    }

    /* Non-causation Alert */
    .alert-causation {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-left: 4px solid var(--primary-accent);
      padding: 8px 12px;
      font-size: 11px;
      color: #1e40af;
      border-radius: 4px;
      margin-bottom: 14px;
      line-height: 1.4;
    }

    /* Appendix */
    .appendix-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-top: 10px;
    }
    .appendix-item {
      background: var(--bg-alt);
      border: 1px solid var(--border-light);
      padding: 8px 12px;
      border-radius: 4px;
    }
    .appendix-term {
      font-weight: 700;
      font-size: 12px;
      color: var(--primary);
    }
    .appendix-formula {
      font-family: monospace;
      font-size: 10px;
      color: var(--primary-accent);
      margin: 2px 0;
    }
    .appendix-desc {
      font-size: 11px;
      color: var(--secondary);
    }

    /* Footer */
    .report-footer {
      margin-top: 30px;
      padding-top: 12px;
      border-top: 1px solid var(--border-light);
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: var(--text-muted);
    }
  `;
}
