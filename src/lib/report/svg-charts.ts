import type { ReportChart } from './types.js';

/**
 * Escapes unsafe characters in untrusted strings to prevent HTML/script injection.
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates vector SVG for charts so that PDF rendering is instantaneous, crisp, and requires zero external network calls.
 */
export function renderSvgChart(chart: ReportChart): string {
  const width = 720;
  const height = 260;
  const padding = { top: 30, right: 30, bottom: 50, left: 60 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  if (chart.data.length === 0) {
    return `<div class="chart-empty">No data available for chart rendering.</div>`;
  }

  const values = chart.data.map(d => d.value);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  if (chart.chartType === 'line') {
    // Render SVG Line Chart
    const points = chart.data.map((d, i) => {
      const x = padding.left + (i / Math.max(chart.data.length - 1, 1)) * plotWidth;
      const y = padding.top + plotHeight - ((d.value - minVal) / range) * plotHeight;
      return { x, y, label: d.label, val: d.value };
    });

    const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const areaData = firstPoint && lastPoint
      ? `${pathData} L ${lastPoint.x.toFixed(1)} ${(padding.top + plotHeight).toFixed(1)} L ${firstPoint.x.toFixed(1)} ${(padding.top + plotHeight).toFixed(1)} Z`
      : '';

    const dots = points.map(p => `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>
      <text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="#1e293b">${escapeHtml(p.val >= 1000 ? (p.val / 1000).toFixed(1) + 'k' : p.val.toFixed(0))}</text>
      <text x="${p.x.toFixed(1)}" y="${(padding.top + plotHeight + 18).toFixed(1)}" text-anchor="middle" font-size="9" fill="#64748b">${escapeHtml(p.label)}</text>
    `).join('');

    return `
      <svg class="report-svg-chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Gridlines -->
        <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="#e2e8f0" stroke-dasharray="3,3"/>
        <line x1="${padding.left}" y1="${padding.top + plotHeight / 2}" x2="${width - padding.right}" y2="${padding.top + plotHeight / 2}" stroke="#e2e8f0" stroke-dasharray="3,3"/>
        <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" stroke="#cbd5e1" stroke-width="1"/>
        <!-- Area fill -->
        <path d="${areaData}" fill="rgba(37, 99, 235, 0.08)"/>
        <!-- Trend line -->
        <path d="${pathData}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
      </svg>
    `;
  }

  // Render SVG Bar Chart (default)
  const barCount = chart.data.length;
  const barWidth = Math.max(Math.min((plotWidth / barCount) * 0.65, 48), 12);
  const gap = plotWidth / barCount;

  const bars = chart.data.map((d, i) => {
    const x = padding.left + i * gap + (gap - barWidth) / 2;
    const barHeight = Math.max(((d.value - minVal) / range) * plotHeight, 2);
    const y = padding.top + plotHeight - barHeight;
    const displayVal = d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : `${d.value}`;

    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" fill="#3b82f6"/>
      <text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="#1e293b">${escapeHtml(displayVal)}</text>
      <text x="${(x + barWidth / 2).toFixed(1)}" y="${(padding.top + plotHeight + 16).toFixed(1)}" text-anchor="middle" font-size="9" fill="#64748b">${escapeHtml(d.label)}</text>
    `;
  }).join('');

  return `
    <svg class="report-svg-chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Horizontal axis -->
      <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" stroke="#cbd5e1" stroke-width="1"/>
      <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="#f1f5f9" stroke-dasharray="3,3"/>
      <line x1="${padding.left}" y1="${padding.top + plotHeight / 2}" x2="${width - padding.right}" y2="${padding.top + plotHeight / 2}" stroke="#f1f5f9" stroke-dasharray="3,3"/>
      ${bars}
    </svg>
  `;
}
