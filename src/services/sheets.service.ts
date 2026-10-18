import { auth, sheets } from '@googleapis/sheets';

/** Read-only is enough: confirmations are not written back to the sheet (ADR-004). */
const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

/** Abstraction so the attendance run can be tested without calling Google. */
export interface AttendanceSheetReader {
  readRows(): Promise<string[][]>;
}

export interface SheetsConfig {
  serviceAccountEmail: string;
  privateKey: string;
  spreadsheetId: string;
  range: string;
}

export function createSheetsReader(config: SheetsConfig): AttendanceSheetReader {
  const jwt = new auth.JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    scopes: [SHEETS_READONLY_SCOPE],
  });
  const client = sheets({ version: 'v4', auth: jwt });

  return {
    async readRows(): Promise<string[][]> {
      const response = await client.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: config.range,
      });

      // `values` is omitted entirely when the range is empty, and cells come back
      // as `any[][]`. Normalising here keeps loose types from leaking further in.
      const values: unknown[][] = response.data.values ?? [];
      return values.map((row) => row.map((value) => (value === null || value === undefined ? '' : String(value))));
    },
  };
}
