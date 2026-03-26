export interface TableInfo {
  name: string;
  rowCount: number;
  sizeBytes: number;
  sizePretty: string;
  columnCount: number;
}
export interface DatabaseStatus {
  connected: boolean;
  version: string;
  dbName: string;
  maskedUrl: string;
  tableCount: number;
}
export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;
  command: string;
}
export interface QueryRequest {
  sql: string;
  mode: 'read' | 'write';
}
//# sourceMappingURL=admin.types.d.ts.map
