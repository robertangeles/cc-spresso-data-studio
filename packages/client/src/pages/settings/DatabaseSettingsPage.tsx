import { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { MaskedField } from '../../components/ui/MaskedField';
import { useDatabaseStatus, useTableInfo, useQueryTool } from '../../hooks/useAdmin';
import { api } from '../../lib/api';

export function DatabaseSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Database</h3>
        <p className="text-sm text-gray-500">View connection status, browse tables, and run queries.</p>
      </div>
      <ConnectionStatusCard />
      <TableViewerCard />
      <QueryToolCard />
    </div>
  );
}

function ConnectionStatusCard() {
  const { status, isLoading, refresh } = useDatabaseStatus();
  const [dbUrl, setDbUrl] = useState<{ raw: string; masked: string } | null>(null);

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

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-gray-900">Connection Status</h4>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={isLoading}>
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>
      {isLoading && !status ? (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : status ? (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Status</p>
            <p className="flex items-center gap-2 font-medium">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  status.connected ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              {status.connected ? 'Connected' : 'Disconnected'}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Database</p>
            <p className="font-medium">{status.dbName}</p>
          </div>
          <div className="col-span-2">
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
                <p className="text-gray-500">Connection URL</p>
                <p className="font-mono text-xs">{status.maskedUrl}</p>
              </div>
            )}
          </div>
          <div>
            <p className="text-gray-500">Tables</p>
            <p className="font-medium">{status.tableCount}</p>
          </div>
          <div className="col-span-2">
            <p className="text-gray-500">Version</p>
            <p className="text-xs text-gray-700">{status.version}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-red-600">Failed to load database status.</p>
      )}
    </Card>
  );
}

function TableViewerCard() {
  const { tables, isLoading, refresh } = useTableInfo();

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-gray-900">Tables</h4>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={isLoading}>
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>
      {isLoading && tables.length === 0 ? (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : tables.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 pr-4 font-medium">Table Name</th>
                <th className="pb-2 pr-4 font-medium text-right">Rows</th>
                <th className="pb-2 pr-4 font-medium text-right">Size</th>
                <th className="pb-2 font-medium text-right">Columns</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.name} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-mono text-xs">{t.name}</td>
                  <td className="py-2 pr-4 text-right">{t.rowCount.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right">{t.sizePretty}</td>
                  <td className="py-2 text-right">{t.columnCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No tables found.</p>
      )}
    </Card>
  );
}

function QueryToolCard() {
  const [sql, setSql] = useState('');
  const [mode, setMode] = useState<'read' | 'write'>('read');
  const { result, isLoading, error, executeQuery, clear } = useQueryTool();

  const handleExecute = () => {
    if (sql.trim()) executeQuery(sql, mode);
  };

  return (
    <Card padding="lg">
      <h4 className="mb-4 font-medium text-gray-900">Query Tool</h4>

      {mode === 'write' && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          Write mode enabled. Queries will modify data.
        </div>
      )}

      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        placeholder="SELECT * FROM users LIMIT 10;"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        rows={4}
      />

      <div className="mt-3 flex items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setMode('read')}
            className={`px-3 py-1.5 font-medium transition-colors ${
              mode === 'read'
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Read-Only
          </button>
          <button
            type="button"
            onClick={() => setMode('write')}
            className={`px-3 py-1.5 font-medium transition-colors ${
              mode === 'write'
                ? 'bg-amber-50 text-amber-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Write
          </button>
        </div>

        <Button onClick={handleExecute} disabled={isLoading || !sql.trim()} size="sm">
          {isLoading ? 'Executing...' : 'Execute'}
        </Button>

        {(result || error) && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-4 text-xs text-gray-500">
            <span>{result.command}</span>
            <span>{result.rowCount} row{result.rowCount !== 1 ? 's' : ''}</span>
            <span>{result.duration}ms</span>
          </div>
          {result.columns.length > 0 && result.rows.length > 0 ? (
            <div className="max-h-96 overflow-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    {result.columns.map((col) => (
                      <th
                        key={col}
                        className="border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      {result.columns.map((col) => (
                        <td key={col} className="px-3 py-1.5 font-mono text-xs text-gray-700">
                          {row[col] === null ? (
                            <span className="text-gray-400 italic">null</span>
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
            </div>
          ) : (
            <p className="text-sm text-gray-500">Query executed successfully. No rows returned.</p>
          )}
        </div>
      )}
    </Card>
  );
}
