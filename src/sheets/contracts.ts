export type TransferRecord = {
  sourceRowId: string;
  rawTimestamp: string;
  occurredAt: Date | null;
  sheetRealName: string;
  sheetAmericanName: string;
  customerName: string;
  phoneNumber: string;
};

export type TransferDiagnostic = {
  rowNumber: number;
  code:
    | "duplicate"
    | "invalid_timestamp"
    | "malformed_opener"
    | "unmatched_opener"
    | "ambiguous_opener";
  message: string;
  sheetAmericanName?: string;
};

export type TransferReadResult = {
  records: TransferRecord[];
  diagnostics: TransferDiagnostic[];
};

export type ClosedDealMatchStatus =
  | "matched"
  | "unmatched"
  | "ambiguous"
  | "invalid";

export type NormalizedClosedDeal = {
  sourceRowNumber: number | null;
  timestamp: Date | null;
  timestampIso: string | null;
  closer: string;
  customerName: string;
  fileNumber: string;
  debtAmount: string;
  readyForSubmission: string;
  sheetOpener: string;
  extractedAmericanName: string;
  normalizedAmericanName: string;
  matchedUserId: string | null;
  matchStatus: ClosedDealMatchStatus;
  validationErrors: string[];
};

export type ClosedDealDiagnosticCode =
  | "invalid_timestamp"
  | "missing_timestamp"
  | "missing_opener"
  | "invalid_opener"
  | "invalid_cell"
  | "unmatched_opener"
  | "ambiguous_opener";

export type ClosedDealDiagnostic = {
  sourceRowNumber: number | null;
  code: ClosedDealDiagnosticCode;
  message: string;
};

export type ClosedDealReadResult = {
  worksheet: "Closed";
  generatedAt: string | null;
  headerValidationStatus: "valid";
  totalNonEmptyRows: number;
  records: NormalizedClosedDeal[];
  diagnostics: ClosedDealDiagnostic[];
};

export interface TransfersProvider {
  listTransfers(): Promise<TransferReadResult>;
}
