import "server-only";

import { getEnv } from "@/env";
import { listMatchableUsers } from "@/leaderboard/data";
import { matchTransfersToUsers } from "@/leaderboard/matching";
import {
  GoogleTransfersProvider,
  type TransferSheetConfig,
} from "@/sheets/transfers";

export function transferSheetConfigFromEnv(): TransferSheetConfig | null {
  const env = getEnv();
  if (!env.GOOGLE_TRANSFERS_SHEET_ID || !env.GOOGLE_TRANSFERS_SHEET_GID) {
    return null;
  }
  return {
    sheetId: env.GOOGLE_TRANSFERS_SHEET_ID,
    gid: env.GOOGLE_TRANSFERS_SHEET_GID,
    range: env.GOOGLE_TRANSFERS_SHEET_RANGE,
    timeZone: env.GOOGLE_TRANSFERS_SHEET_TIMEZONE,
    serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    serviceAccountPrivateKey: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  };
}

export async function ingestAndMatchTransfers() {
  const config = transferSheetConfigFromEnv();
  if (!config) {
    return {
      status: "unconfigured" as const,
      message: "The transfer Sheet has not been configured.",
    };
  }

  const provider = new GoogleTransfersProvider(config);
  const [transferResult, users] = await Promise.all([
    provider.listTransfers(),
    listMatchableUsers(),
  ]);
  const matches = matchTransfersToUsers(transferResult.records, users);

  return {
    status: "ready" as const,
    records: transferResult.records,
    matches: matches.results,
    diagnostics: [...transferResult.diagnostics, ...matches.diagnostics],
    duplicateAmericanNames: matches.duplicateAmericanNames,
  };
}
