import type {
  ClosedDealRecord,
  ClosedDealsProvider,
} from "@/sheets/contracts";

export const CLOSED_DEALS_UNCONFIGURED_MESSAGE =
  "Connect a real closed-deals provider and attribution rules before performance can be ranked. Transfer counts are intentionally kept separate.";

export class UnconfiguredClosedDealsProvider implements ClosedDealsProvider {
  readonly configured = false;

  async listClosedDeals(): Promise<ClosedDealRecord[]> {
    throw new Error(CLOSED_DEALS_UNCONFIGURED_MESSAGE);
  }
}

// A Google Sheets adapter will implement this contract once the real
// closed-deals headers and attribution rules are supplied. Keeping it separate
// prevents transfer volume from being presented as closed-deal performance.
