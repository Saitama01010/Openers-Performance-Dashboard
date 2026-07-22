export type TransferFixture = {
  id: string;
  agentEmail: string;
  occurredAt: string;
  disposition: "booked" | "no_show" | "follow_up";
};

export type ClosedDealFixture = {
  id: string;
  agentEmail: string;
  closedAt: string;
  revenueCents: number;
};

export const sampleTransfers: TransferFixture[] = [
  {
    id: "transfer-001",
    agentEmail: "ava.agent@example.com",
    occurredAt: "2026-07-20T15:30:00.000Z",
    disposition: "booked",
  },
  {
    id: "transfer-002",
    agentEmail: "noah.agent@example.com",
    occurredAt: "2026-07-20T17:10:00.000Z",
    disposition: "follow_up",
  },
];

export const sampleClosedDeals: ClosedDealFixture[] = [
  {
    id: "deal-001",
    agentEmail: "ava.agent@example.com",
    closedAt: "2026-07-21T18:20:00.000Z",
    revenueCents: 450000,
  },
];
