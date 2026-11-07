import "server-only";

import { googleDriveAdapter } from "./google-drive";
import { googleSheetsAdapter } from "./google-sheets";
import { postgresAdapter } from "./postgres";
import { supabaseAdapter } from "./supabase";
import type { DestinationAdapter, DestinationType } from "./types";
import { webhookAdapter } from "./webhook";

const ADAPTERS: Record<DestinationType, DestinationAdapter> = {
  google_sheets: googleSheetsAdapter,
  google_drive: googleDriveAdapter,
  webhook: webhookAdapter,
  supabase: supabaseAdapter,
  postgres: postgresAdapter,
};

export function adapterFor(type: DestinationType): DestinationAdapter {
  return ADAPTERS[type];
}
