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

export type ClosedDealRecord = {
  externalId: string;
  closedAt: Date;
  customerId: string | null;
  customerPhoneNumber: string | null;
  transferReference: string | null;
  openerAmericanName: string | null;
  status: string;
  sourceRowId: string;
};

export interface TransfersProvider {
  listTransfers(): Promise<TransferReadResult>;
}

export interface ClosedDealsProvider {
  readonly configured: boolean;
  listClosedDeals(): Promise<ClosedDealRecord[]>;
}
