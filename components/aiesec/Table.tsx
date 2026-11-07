'use client';
import * as React from 'react';
import { Icon } from './icons';
import { cx } from './utils';

export interface TableColumn<T> {
  /** Field to show (when no `render`) and the sort key. */
  key: string;
  header: React.ReactNode;
  /** `end` for numbers (also switches to tabular figures). */
  align?: 'start' | 'center' | 'end';
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  width?: string;
}

export interface TableSort {
  key: string;
  direction: 'ascending' | 'descending';
}

export interface TableProps<T> {
  columns: Array<TableColumn<T>>;
  rows: T[];
  rowKey: (row: T, index: number) => React.Key;
  /** Names the table (and its scroll region). Required; hide it visually with `hideCaption`. */
  caption: React.ReactNode;
  hideCaption?: boolean;
  /** Current sort; sorting the rows is the caller's job. */
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  /** Default `comfortable`. */
  density?: 'comfortable' | 'compact';
  striped?: boolean;
  /** Shown when `rows` is empty. Default "No results". */
  empty?: React.ReactNode;
  className?: string;
}

/** Rows of records to scan and compare, with optional sortable columns. Scrolls sideways on small screens. */
export function Table<T>({ columns, rows, rowKey, caption, hideCaption = false, sort, onSortChange, density = 'comfortable', striped = false, empty = 'No results', className }: TableProps<T>) {
  const captionId = React.useId();
  return (
    <div className={cx('ae-table-wrap', className)} role="region" aria-labelledby={captionId} tabIndex={0}>
      <table className={cx('ae-table', 'ae-body-sm', density === 'compact' && 'ae-table--compact', striped && 'ae-table--striped')}>
        <caption id={captionId} className={hideCaption ? 'ae-sr-only' : 'ae-h4'}>
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const sortable = col.sortable && onSortChange;
              return (
                <th key={col.key} scope="col" className="ae-label" data-align={col.align} style={col.width ? { width: col.width } : undefined} aria-sort={active ? sort?.direction : undefined}>
                  {sortable ? (
                    <button
                      type="button"
                      className="ae-table__sort"
                      onClick={() => onSortChange({ key: col.key, direction: active && sort?.direction === 'ascending' ? 'descending' : 'ascending' })}
                    >
                      {col.header}
                      <Icon name={active ? (sort?.direction === 'ascending' ? 'arrow-up' : 'arrow-down') : 'chevrons-up-down'} size={16} />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="ae-table__empty">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={rowKey(row, i)}>
                {columns.map((col) => (
                  <td key={col.key} data-align={col.align}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
