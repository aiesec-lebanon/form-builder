'use client';
import * as React from 'react';
import { Button } from './Button';
import { Icon } from './icons';
import { Pagination } from './Pagination';
import { Select, type SelectOption } from './Select';
import { Table, type TableProps, type TableSort } from './Table';
import { TextField } from './TextField';
import { cx } from './utils';

export interface DataTableFilter {
  /** Column key whose value must match. */
  key: string;
  label: string;
  /** Choices. Default: the column's distinct values; pass them in server mode. */
  options?: SelectOption[];
}

/** What the table shows. In server mode, send it to your API. */
export interface DataTableQuery {
  search: string;
  /** Chosen value per filter key; a missing key means all. */
  filters: Record<string, string>;
  sort?: TableSort;
  /** Starts at 1. */
  page: number;
  pageSize: number;
}

export interface DataTableProps<T> extends Omit<TableProps<T>, 'sort' | 'onSortChange'> {
  filters?: DataTableFilter[];
  /** Column keys the search looks in (in-browser mode). Default: every column. */
  searchKeys?: string[];
  /** Label and placeholder of the search box. Default "Search". */
  searchLabel?: string;
  /** Rows per page. Default 10. */
  pageSize?: number;
  /** Starting search, filters, sort or page (uncontrolled). */
  defaultQuery?: Partial<DataTableQuery>;
  /** Controlled query; pair with `onQueryChange`. */
  query?: DataTableQuery;
  /** Called on every change; in server mode the search waits for a pause in typing. */
  onQueryChange?: (query: DataTableQuery) => void;
  /** Server mode: how many rows match on the server. `rows` is then the current page, already searched, filtered, sorted and paged. */
  rowCount?: number;
  /** Server mode: the next rows are loading. */
  loading?: boolean;
}

const ALL = '__all__';
const SEARCH_DELAY = 300;
const fold = (value: unknown) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
const field = (row: unknown, key: string) => (row as Record<string, unknown>)[key];

/** In-browser search (case- and accent-insensitive), exact-match filters and a stable, locale-aware sort. */
function applyQuery<T>(rows: T[], query: DataTableQuery, keys: string[], collator: Intl.Collator): T[] {
  const needle = fold(query.search.trim());
  const out = rows.filter(
    (row) => (!needle || keys.some((k) => fold(field(row, k)).includes(needle))) && Object.entries(query.filters).every(([k, v]) => String(field(row, k) ?? '') === v),
  );
  const { sort } = query;
  if (!sort) return out;
  const dir = sort.direction === 'ascending' ? 1 : -1;
  return out.sort((a, b) => {
    const x = field(a, sort.key);
    const y = field(b, sort.key);
    return dir * (typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x ?? ''), String(y ?? '')));
  });
}

/** A Table with search, filters, sorting and pages. Works on the rows you pass; with `rowCount`, your server does the work. */
export function DataTable<T>({
  columns,
  rows,
  caption,
  hideCaption = true,
  empty,
  filters = [],
  searchKeys,
  searchLabel = 'Search',
  pageSize = 10,
  defaultQuery,
  query: controlled,
  onQueryChange,
  rowCount,
  loading = false,
  className,
  ...table
}: DataTableProps<T>) {
  const server = rowCount !== undefined;
  const [own, setOwn] = React.useState<DataTableQuery>(() => ({ search: '', filters: {}, page: 1, pageSize, ...defaultQuery }));
  const query = controlled ?? own;
  const latest = React.useRef(query);
  latest.current = query;

  // Any change but paging goes back to the first page.
  const update = (patch: Partial<DataTableQuery>) => {
    const next = { ...latest.current, ...patch, page: patch.page ?? 1 };
    latest.current = next;
    if (!controlled) setOwn(next);
    onQueryChange?.(next);
  };

  const [text, setText] = React.useState(query.search);
  React.useEffect(() => setText(query.search), [query.search]);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const search = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    if (server) timer.current = setTimeout(() => update({ search: value }), SEARCH_DELAY);
    else update({ search: value });
  };
  const filter = (key: string, value: string | null) => {
    const next = { ...latest.current.filters };
    if (value && value !== ALL) next[key] = value;
    else delete next[key];
    update({ filters: next });
  };
  const clear = () => {
    clearTimeout(timer.current);
    setText('');
    update({ search: '', filters: {} });
  };

  const collator = React.useMemo(() => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }), []);
  const keys = searchKeys ?? columns.map((c) => c.key);
  const matched = React.useMemo(
    () => (server ? rows : applyQuery(rows, query, keys, collator)),
    [server, rows, query.search, query.filters, query.sort, keys.join('\n'), collator],
  );

  const total = rowCount ?? matched.length;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const first = (page - 1) * query.pageSize;
  const shown = server ? rows : matched.slice(first, first + query.pageSize);
  const active = text !== '' || Object.keys(query.filters).length > 0;
  const options = (f: DataTableFilter): SelectOption[] => [
    { value: ALL, label: 'All' },
    ...(f.options ??
      [...new Set(rows.map((r) => String(field(r, f.key) ?? '')))]
        .filter(Boolean)
        .sort(collator.compare)
        .map((v) => ({ value: v, label: v }))),
  ];

  return (
    <div className={cx('ae-data-table', className)}>
      <div className="ae-data-table__toolbar">
        <TextField
          className="ae-data-table__search"
          type="search"
          label={searchLabel}
          hideLabel
          placeholder={searchLabel}
          iconStart={<Icon name="search" size={20} />}
          value={text}
          onChange={(event) => search(event.target.value)}
        />
        {filters.map((f) => (
          <Select key={f.key} className="ae-data-table__filter" label={f.label} options={options(f)} value={query.filters[f.key] ?? ALL} onChange={(value) => filter(f.key, value)} />
        ))}
        {active && (
          <Button variant="ghost" className="ae-data-table__clear" iconStart={<Icon name="x" size={20} />} onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>
      <div className="ae-data-table__rows" aria-busy={loading || undefined}>
        <Table
          {...table}
          caption={caption}
          hideCaption={hideCaption}
          columns={columns}
          rows={shown}
          sort={query.sort}
          onSortChange={(sort) => update({ sort })}
          empty={active ? 'No matches. Try another search or clear the filters.' : empty}
        />
      </div>
      <div className="ae-data-table__footer">
        <p className="ae-data-table__count ae-body-sm" role="status">
          {total ? `${first + 1}–${Math.min(first + query.pageSize, total)} of ${total}` : 'No results'}
        </p>
        <Pagination page={page} pageCount={pageCount} onPageChange={(p) => update({ page: p })} label={typeof caption === 'string' ? `${caption}, pages` : undefined} />
      </div>
    </div>
  );
}
