import type {
  ClosedDealDiagnostic,
  NormalizedClosedDeal,
  TransferDiagnostic,
  TransferRecord,
} from "@/sheets/contracts";
import { normalizeAmericanName } from "@/sheets/transfers";

export type MatchableUser = {
  id: string;
  realName: string;
  americanName: string;
  teamId: string | null;
  teamName: string | null;
};

export type MatchedTransfer =
  | { status: "matched"; transfer: TransferRecord; user: MatchableUser }
  | {
      status: "unmatched" | "ambiguous";
      transfer: TransferRecord;
      candidates: MatchableUser[];
    };

export function matchTransfersToUsers(
  transfers: readonly TransferRecord[],
  users: readonly MatchableUser[],
) {
  const usersByAmericanName = usersByNormalizedAmericanName(users);

  const diagnostics: TransferDiagnostic[] = [];
  const results: MatchedTransfer[] = transfers.map((transfer) => {
    const matches =
      usersByAmericanName.get(
        normalizeAmericanName(transfer.sheetAmericanName),
      ) ?? [];
    const rowNumber = Number(transfer.sourceRowId.split(":").at(-1)) || 0;
    if (matches.length === 0) {
      diagnostics.push({
        rowNumber,
        code: "unmatched_opener",
        sheetAmericanName: transfer.sheetAmericanName,
        message: `No active user matches American Name "${transfer.sheetAmericanName}".`,
      });
      return {
        status: "unmatched",
        transfer,
        candidates: [],
      };
    }
    if (matches.length > 1) {
      diagnostics.push({
        rowNumber,
        code: "ambiguous_opener",
        sheetAmericanName: transfer.sheetAmericanName,
        message: `Multiple active users match American Name "${transfer.sheetAmericanName}".`,
      });
      return {
        status: "ambiguous",
        transfer,
        candidates: matches,
      };
    }
    return { status: "matched", transfer, user: matches[0] };
  });

  return { results, diagnostics, duplicateAmericanNames: duplicateNames(usersByAmericanName) };
}

export function matchClosedDealsToUsers(
  deals: readonly NormalizedClosedDeal[],
  users: readonly MatchableUser[],
) {
  const usersByAmericanName = usersByNormalizedAmericanName(users);
  const diagnostics: ClosedDealDiagnostic[] = [];
  const records = deals.map((deal): NormalizedClosedDeal => {
    if (deal.matchStatus === "invalid") return deal;

    const matches =
      usersByAmericanName.get(deal.normalizedAmericanName) ?? [];
    if (matches.length === 0) {
      diagnostics.push({
        sourceRowNumber: deal.sourceRowNumber,
        code: "unmatched_opener",
        message: `No active user matches the Closed opener on row ${deal.sourceRowNumber ?? "unknown"}.`,
      });
      return {
        ...deal,
        matchedUserId: null,
        matchStatus: "unmatched",
      };
    }
    if (matches.length > 1) {
      diagnostics.push({
        sourceRowNumber: deal.sourceRowNumber,
        code: "ambiguous_opener",
        message: `Multiple active users match the Closed opener on row ${deal.sourceRowNumber ?? "unknown"}.`,
      });
      return {
        ...deal,
        matchedUserId: null,
        matchStatus: "ambiguous",
      };
    }
    return {
      ...deal,
      matchedUserId: matches[0].id,
      matchStatus: "matched",
    };
  });

  return {
    records,
    diagnostics,
    duplicateAmericanNames: duplicateNames(usersByAmericanName),
  };
}

function usersByNormalizedAmericanName(
  users: readonly MatchableUser[],
) {
  const usersByAmericanName = new Map<string, MatchableUser[]>();
  for (const user of users) {
    const key = normalizeAmericanName(user.americanName);
    if (!key) continue;
    const matches = usersByAmericanName.get(key) ?? [];
    matches.push(user);
    usersByAmericanName.set(key, matches);
  }
  return usersByAmericanName;
}

function duplicateNames(usersByAmericanName: Map<string, MatchableUser[]>) {
  return Array.from(usersByAmericanName.entries())
    .filter(([, users]) => users.length > 1)
    .map(([normalizedAmericanName, users]) => ({
      normalizedAmericanName,
      userIds: users.map((user) => user.id),
    }));
}
