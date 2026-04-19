import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Database,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Trash2,
  Search,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { MaskedField } from '../../components/ui/MaskedField';
import { useDatabaseStatus, useTableInfo, useQueryTool } from '../../hooks/useAdmin';
import { api } from '../../lib/api';

const SIDEBAR_KEY = 'cc:dbSettings:sidebarOpen';
const EDITOR_HEIGHT_KEY = 'cc:dbSettings:editorHeight';
const COLLAPSED_GROUPS_KEY = 'cc:dbSettings:collapsedGroups';
const DEFAULT_EDITOR_HEIGHT = 180;
const MIN_EDITOR_HEIGHT = 80;
const MIN_RESULTS_HEIGHT = 120;

/** Group a table name's prefix (everything before the first underscore, or the whole name). */
function groupOf(name: string): string {
  const idx = name.indexOf('_');
  return idx === -1 ? name : name.slice(0, idx);
}

export function DatabaseSettingsPage() {
  const { status, isLoading: statusLoading, refresh: refreshStatus } = useDatabaseStatus();
  const { tables, isLoading: tablesLoading, refresh: refreshTables } = useTableInfo();

  const [sql, setSql] = useState('');
  const [mode, setMode] = useState<'read' | 'write'>('read');
  const [filter, setFilter] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(SIDEBAR_KEY) !== '0';
  });
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [dbUrl, setDbUrl] = useState<{ raw: string; masked: string } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(COLLAPSED_GROUPS_KEY);
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });
  const [editorHeight, setEditorHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_EDITOR_HEIGHT;
    const stored = window.localStorage.getItem(EDITOR_HEIGHT_KEY);
    const n = stored ? parseInt(stored, 10) : DEFAULT_EDITOR_HEIGHT;
    return Number.isFinite(n) ? Math.max(MIN_EDITOR_HEIGHT, n) : DEFAULT_EDITOR_HEIGHT;
  });

  const { result, isLoading: queryLoading, error, executeQuery, clear } = useQueryTool();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);

  const fetchUrl = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/database/url');
      setDbUrl(data.data);
    } catch {
      setDbUrl(null);
    }
  }, []);

  useEffect(() => {
    fetchUrl();
  }, [fetchUrl]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]));
      }
      return next;
    });
  }, []);

  const handleExecute = useCallback(
    (sqlOverride?: string) => {
      const toRun = (sqlOverride ?? sql).trim();
      if (!toRun) return;
      executeQuery(toRun, mode);
    },
    [sql, mode, executeQuery],
  );

  const handleTableClick = useCallback(
    (name: string) => {
      setSelectedTable(name);
      const q = `SELECT * FROM "${name}" LIMIT 100;`;
      setSql(q);
      handleExecute(q);
    },
    [handleExecute],
  );

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  const refreshAll = useCallback(() => {
    refreshStatus();
    refreshTables();
    fetchUrl();
  }, [refreshStatus, refreshTables, fetchUrl]);

  // Resizer drag for the editor/results split
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const container = splitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const raw = e.clientY - rect.top;
      const max = rect.height - MIN_RESULTS_HEIGHT;
      const next = Math.max(MIN_EDITOR_HEIGHT, Math.min(max, raw));
      setEditorHeight(next);
    };
    const handleUp = () => {
      setDragging(false);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(EDITOR_HEIGHT_KEY, String(editorHeight));
      }
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, editorHeight]);

  // Group tables by prefix, then filter within group
  const tableGroups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const filtered = f ? tables.filter((t) => t.name.toLowerCase().includes(f)) : tables;
    const groups = new Map<string, typeof tables>();
    for (const t of filtered) {
      const g = groupOf(t.name);
      const arr = groups.get(g) ?? [];
      arr.push(t);
      groups.set(g, arr);
    }
    // Singletons (group with exactly 1 table where the name == group) go to "other"
    const other: typeof tables = [];
    const grouped: Array<[string, typeof tables]> = [];
    for (const [g, list] of groups) {
      if (list.length === 1) {
        other.push(list[0]);
      } else {
        grouped.push([g, list]);
      }
    }
    grouped.sort(([a], [b]) => a.localeCompare(b));
    other.sort((a, b) => a.name.localeCompare(b.name));
    if (other.length > 0) grouped.push(['other', other]);
    return grouped;
  }, [tables, filter]);

  const totalSizeMB = tables.reduce((sum, t) => sum + t.sizeBytes, 0) / (1024 * 1024);
  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);

  return (
    <div className="flex flex-col gap-3 overflow-hidden" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Compact status bar */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-1/80 backdrop-blur-sm px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Database
            </span>
          </div>
          <span className="text-border-subtle">·</span>
          <span className="flex items-center gap-1.5 text-xs">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                status?.connected
                  ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
                  : 'bg-red-500'
              }`}
            />
            <span className="font-medium text-text-primary">
              {status?.connected ? 'Connected' : statusLoading ? 'Checking…' : 'Disconnected'}
            </span>
          </span>
          {status && (
            <>
              <span className="text-border-subtle">·</span>
              <span className="text-xs text-text-secondary truncate">{status.dbName}</span>
              <span className="text-border-subtle">·</span>
              <span className="text-xs text-text-secondary tabular-nums">
                {totalSizeMB.toFixed(2)} MB
              </span>
              <span className="text-border-subtle">·</span>
              <span className="text-xs text-text-secondary tabular-nums">
                {tables.length} table{tables.length === 1 ? '' : 's'}
              </span>
              <span className="text-border-subtle">·</span>
              <span className="text-xs text-text-secondary tabular-nums">
                {totalRows.toLocaleString()} rows
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowConnectionDetails((v) => !v)}
            className="text-xs text-text-tertiary hover:text-accent transition-colors"
          >
            {showConnectionDetails ? 'Hide details' : 'Details'}
          </button>
          <Button
            variant="secondary"
            size="sm"
            onClick={refreshAll}
            disabled={statusLoading || tablesLoading}
            title="Refresh status and table list"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${statusLoading || tablesLoading ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline ml-1.5">Refresh</span>
          </Button>
        </div>
      </div>

      {showConnectionDetails && status && (
        <div className="rounded-xl border border-border-subtle bg-surface-1/60 backdrop-blur-sm px-4 py-3 animate-slide-up shrink-0">
          {dbUrl ? (
            <MaskedField
              label="Connection URL"
              value={dbUrl.raw}
              maskedValue={dbUrl.masked}
              editable
              onSave={async (newValue) => {
                await api.put('/admin/settings/DATABASE_URL', { value: newValue, isSecret: true });
                fetchUrl();
              }}
            />
          ) : (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                Connection URL
              </p>
              <p className="font-mono text-xs text-text-secondary mt-1">{status.maskedUrl}</p>
            </div>
          )}
          <p className="mt-2 text-[10px] text-text-tertiary truncate">{status.version}</p>
        </div>
      )}

      {/* Main IDE layout */}
      <div className="flex flex-1 min-h-0 gap-3 overflow-hidden">
        {/* Tables sidebar — internal scroll only */}
        {sidebarOpen ? (
          <aside className="w-64 shrink-0 flex flex-col rounded-xl border border-border-subtle bg-surface-1/60 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle/60 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Tables
                </span>
                <span className="text-[10px] text-text-tertiary/70 tabular-nums">
                  {tables.length}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                className="p-1 rounded text-text-tertiary hover:text-accent hover:bg-surface-3/60 transition-colors"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="px-2 py-2 border-b border-border-subtle/60 shrink-0">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text-tertiary pointer-events-none" />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter tables…"
                  className="w-full rounded-md border border-border-subtle bg-surface-2/50 pl-7 pr-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary/70 focus:border-accent/40 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Scrollable table list — scroll stays IN the sidebar */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {tablesLoading && tables.length === 0 ? (
                <div className="flex justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                </div>
              ) : tableGroups.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-text-tertiary">
                  {filter ? 'No matches' : 'No tables'}
                </p>
              ) : (
                <div className="py-1">
                  {tableGroups.map(([groupName, groupTables]) => {
                    const collapsed = collapsedGroups.has(groupName);
                    const isOther = groupName === 'other';
                    return (
                      <div key={groupName} className="mb-0.5">
                        <button
                          type="button"
                          onClick={() => toggleGroup(groupName)}
                          className="w-full flex items-center gap-1 px-2 py-1 text-left hover:bg-surface-3/40 transition-colors group"
                        >
                          {collapsed ? (
                            <ChevronRight className="h-3 w-3 text-text-tertiary shrink-0" />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-text-tertiary shrink-0" />
                          )}
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                            {isOther ? 'other' : `${groupName}_`}
                          </span>
                          <span className="text-[10px] text-text-tertiary/60 tabular-nums ml-auto">
                            {groupTables.length}
                          </span>
                        </button>
                        {!collapsed && (
                          <ul>
                            {groupTables.map((t) => (
                              <li key={t.name}>
                                <button
                                  type="button"
                                  onClick={() => handleTableClick(t.name)}
                                  className={`w-full flex items-center justify-between gap-2 pl-6 pr-3 py-1 text-left transition-colors ${
                                    selectedTable === t.name
                                      ? 'bg-accent/10 text-accent'
                                      : 'text-text-secondary hover:bg-surface-3/60 hover:text-text-primary'
                                  }`}
                                  title={`${t.name} — ${t.rowCount.toLocaleString()} rows · ${t.columnCount} cols`}
                                >
                                  <span className="font-mono text-[11px] truncate">
                                    {isOther
                                      ? t.name
                                      : t.name.slice(groupName.length + 1) || t.name}
                                  </span>
                                  <span className="text-[10px] text-text-tertiary tabular-nums shrink-0">
                                    {t.rowCount.toLocaleString()}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={toggleSidebar}
            className="shrink-0 self-start rounded-lg border border-border-subtle bg-surface-1/60 backdrop-blur-sm p-2 text-text-tertiary hover:text-accent hover:border-accent/30 transition-colors"
            title="Show tables sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        {/* Right pane: editor + results with draggable split */}
        <div ref={splitRef} className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Editor panel */}
          <div
            className="rounded-xl border border-border-subtle bg-surface-1/60 backdrop-blur-sm overflow-hidden flex flex-col shrink-0"
            style={{ height: `${editorHeight}px` }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle/60 shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                Query Tool
              </span>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border border-border-subtle overflow-hidden text-[10px]">
                  <button
                    type="button"
                    onClick={() => setMode('read')}
                    className={`px-2 py-0.5 font-semibold uppercase tracking-wider transition-colors ${
                      mode === 'read'
                        ? 'bg-accent/15 text-accent'
                        : 'text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    Read-Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('write')}
                    className={`px-2 py-0.5 font-semibold uppercase tracking-wider transition-colors ${
                      mode === 'write'
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    Write
                  </button>
                </div>
                <Button
                  onClick={() => handleExecute()}
                  disabled={queryLoading || !sql.trim()}
                  size="sm"
                >
                  <Play className="h-3 w-3" />
                  <span className="ml-1">{queryLoading ? 'Running…' : 'Run'}</span>
                  <kbd className="ml-2 rounded bg-surface-3/80 px-1 py-0 text-[9px] text-text-tertiary">
                    ⌃⏎
                  </kbd>
                </Button>
                {(result || error) && (
                  <button
                    type="button"
                    onClick={clear}
                    className="p-1.5 rounded text-text-tertiary hover:text-red-400 hover:bg-surface-3/60 transition-colors"
                    title="Clear results"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {mode === 'write' && (
              <div className="flex items-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-3 py-1 text-[11px] text-amber-400 shrink-0">
                <AlertTriangle className="h-3 w-3" />
                <span>Write mode — queries will modify data.</span>
              </div>
            )}

            <textarea
              ref={editorRef}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              placeholder="SELECT * FROM users LIMIT 10;  -- or click a table on the left"
              className="flex-1 min-h-0 w-full bg-surface-2/40 px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none resize-none"
            />
          </div>

          {/* Drag handle */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            className={`h-2 shrink-0 flex items-center justify-center cursor-row-resize group ${
              dragging ? 'bg-accent/40' : ''
            }`}
            title="Drag to resize"
          >
            <div
              className={`h-0.5 w-12 rounded-full transition-colors ${
                dragging ? 'bg-accent' : 'bg-border-subtle group-hover:bg-accent/60'
              }`}
            />
          </div>

          {/* Results panel — fills remaining space */}
          <div className="flex-1 min-h-0 rounded-xl border border-border-subtle bg-surface-1/60 backdrop-blur-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle/60 shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                Results
              </span>
              {result && (
                <div className="flex items-center gap-3 text-[10px] text-text-tertiary tabular-nums">
                  <span>{result.command}</span>
                  <span>
                    {result.rowCount} row{result.rowCount !== 1 ? 's' : ''}
                  </span>
                  <span className="text-accent">{result.duration}ms</span>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {error ? (
                <div className="m-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span className="font-mono text-xs">{error}</span>
                  </div>
                </div>
              ) : result && result.columns.length > 0 && result.rows.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-2/90 backdrop-blur-sm z-10">
                    <tr>
                      {result.columns.map((col) => (
                        <th
                          key={col}
                          className="border-b border-border-subtle px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-tertiary"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-border-subtle/40 hover:bg-surface-3/30"
                      >
                        {result.columns.map((col) => (
                          <td key={col} className="px-3 py-1 font-mono text-xs text-text-secondary">
                            {row[col] === null ? (
                              <span className="text-text-tertiary italic">null</span>
                            ) : typeof row[col] === 'object' ? (
                              JSON.stringify(row[col])
                            ) : (
                              String(row[col])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : result ? (
                <p className="m-3 text-sm text-text-secondary">
                  Query executed successfully. No rows returned.
                </p>
              ) : (
                <p className="m-3 text-xs text-text-tertiary italic">
                  Run a query or click a table to preview its first 100 rows.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
