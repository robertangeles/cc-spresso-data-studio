/**
 * Formula-injection escape for clipboard / CSV cells.
 *
 * When a user copies synthetic-data rows and pastes them into Excel,
 * Google Sheets, or Numbers, any cell that starts with `=`, `+`, `-`,
 * `@`, `\t`, or `\r` is interpreted as a formula. A row containing
 * `=cmd|' /c calc'!A1` in the wrong tool can execute real code.
 *
 * Prefixing a single quote (`'`) tells spreadsheet apps to treat the
 * value as text. Costs one character per cell; worth it.
 *
 * Used by SyntheticDataDrawer for both on-screen rendering and
 * clipboard copy. The same helper will be reused for CSV export in
 * Step 8 so the rule is centralised.
 */

const FORMULA_LEADERS = ['=', '+', '-', '@', '\t', '\r'];

export function escapeClipboardCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.length === 0) return str;
  return FORMULA_LEADERS.includes(str[0]) ? `'${str}` : str;
}

/** Format a row map into a tab-separated line with formula-injection
 *  escaping applied to every cell. Preserves the supplied key order. */
export function rowToTsv(row: Record<string, unknown>, keys: string[]): string {
  return keys.map((k) => escapeClipboardCell(row[k]).replace(/[\t\r\n]/g, ' ')).join('\t');
}
