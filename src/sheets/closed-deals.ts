import type {
  ClosedDealRecord,
  ClosedDealsProvider,
} from "@/sheets/contracts";

export class UnconfiguredClosedDealsProvider implements ClosedDealsProvider {
  readonly configured = false;

  async listClosedDeals(): Promise<ClosedDealRecord[]> {
    throw new Error("Closed-deals data source has not been configured yet.");
  }
}

// A Google Sheets adapter will implement this contract once the real
// closed-deals headers and attribution rules are supplied. Keeping it separate
// prevents transfer volume from being presented as closed-deal performance.
