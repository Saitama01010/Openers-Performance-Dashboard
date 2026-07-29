import "server-only";

import { getEnv } from "@/env";
import {
  matchTransfersToUsers,
  type MatchableUser,
} from "@/leaderboard/matching";
import {
  GoogleAppsScriptTransfersProvider,
  type TransferSheetConfig,
} from "@/sheets/transfers";

export function transferSheetConfigFromEnv(): TransferSheetConfig | null {
  const env = getEnv();
  if (
    !env.GOOGLE_TRANSFERS_APPS_SCRIPT_URL ||
    !env.LEADERBOARD_API_SECRET
  ) {
    return null;
  }
  return {
    endpointUrl: env.GOOGLE_TRANSFERS_APPS_SCRIPT_URL,
    secret: env.LEADERBOARD_API_SECRET,
    timeZone: env.GOOGLE_SHEETS_TIMEZONE,
  };
}

export async function ingestAndMatchTransfers(
  users:
    | readonly MatchableUser[]
    | Promise<readonly MatchableUser[]>,
  config = transferSheetConfigFromEnv(),
) {
  if (!config) {
    return {
      status: "unconfigured" as const,
      message: "The Google Sheet transfer source has not been configured.",
    };
  }

  const provider = new GoogleAppsScriptTransfersProvider(config);
  const [transferResult, resolvedUsers] = await Promise.all([
    provider.listTransfers(),
    Promise.resolve(users),
  ]);
  const matches = matchTransfersToUsers(transferResult.records, resolvedUsers);

  return {
    status: "ready" as const,
    timeZone: config.timeZone,
    records: transferResult.records,
    matches: matches.results,
    diagnostics: [...transferResult.diagnostics, ...matches.diagnostics],
    duplicateAmericanNames: matches.duplicateAmericanNames,
  };
}
