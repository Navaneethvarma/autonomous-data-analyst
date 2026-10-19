import React, { useState, useMemo } from 'react';
import type { TableSpec } from '../../lib/dashboard/types.js';

interface DataTableProps {
  table: TableSpec;
  activeFilters: Record<string, string>;
}

export const DataTable: React.FC<DataTableProps> = ({ table, activeFilters }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string>(table.defaultSortColumn || table.columns[0]?.key || '');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(table.defaultSortDirection || 'asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = table.pageSize || 10;

  // Filter rows based on search term & active global filters
  const filteredRows = useMemo(() => {
    return table.rows.filter(row => {
      // 1. Check global interactive filters
      for (const [col, filterVal] of Object.entries(activeFilters)) {
        if (filterVal !== 'All') {
          const cellVal = String(row[col] ?? '');
          if (cellVal !== filterVal) return false;
        }
      }

      // 2. Search term across all string/number columns
      if (searchTerm.trim() !== '') {
        const query = searchTerm.toLowerCase();
        const matches = Object.values(row).some(val =>
          String(val ?? '').toLowerCase().includes(query)
        );
        if (!matches) return false;
      }

      return true;
    });
  }, [table.rows, activeFilters, searchTerm]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortColumn) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const valA = a[sortColumn];
      const valB = b[sortColumn];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortDirection === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  return (
    <section className="table-section" id="dashboard-table-section">
      <div className="table-toolbar">
        <div>
          <h2 className="section-title" style={{ marginBottom: 4 }}>
            <span>{table.title}</span>
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Showing {filteredRows.length} rows (bounded display). Complete aggregate operations were computed across all {table.totalRowCount} records.
          </p>
        </div>

        <input
          type="text"
          className="table-search-input"
          placeholder="Filter table rows..."
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          aria-label="Filter records"
        />
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {table.columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  title={`Sort by ${col.label}`}
                >
                  {col.label} {sortColumn === col.key ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length > 0 ? (
              paginatedRows.map((row, idx) => (
                <tr key={idx}>
                  {table.columns.map(col => {
                    const val = row[col.key];
                    return (
                      <td key={col.key}>
                        {val === null || val === undefined ? (
                          <span style={{ color: '#64748b', fontStyle: 'italic' }}>null</span>
                        ) : (
                          String(val)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={table.columns.length} style={{ textAlign: 'center', padding: '32px' }}>
                  No records match current filter criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <span>
          Page {currentPage} of {totalPages} ({filteredRows.length} records filtered)
        </span>
        <div>
          <button
            className="page-btn"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(prev => prev - 1)}
          >
            Previous
          </button>
          <button
            className="page-btn"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(prev => prev + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
};
