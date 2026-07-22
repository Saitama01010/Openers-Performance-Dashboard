export type TransferRecord = {
  externalId: string;
  source: "google_sheets_fixture";
  agentEmail: string;
  occurredAt: string;
  outcome: "booked" | "follow_up" | "no_show" | "cancelled";
};

export type ClosedDealRecord = {
  externalId: string;
  source: "google_sheets_fixture";
  agentEmail: string;
  closedAt: string;
  revenueCents: number;
  productName: string;
};

export interface TransfersProvider {
  listTransfers(): Promise<TransferRecord[]>;
}

export interface ClosedDealsProvider {
  listClosedDeals(): Promise<ClosedDealRecord[]>;
}
