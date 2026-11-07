import "server-only";

import { getFile } from "@/lib/google/api";
import { googleAccessToken } from "@/lib/google/tokens";

import { driveConfig, failure, success, type DestinationAdapter } from "./types";

// Google Drive file storage (role "files"). Browsers upload directly
// (ADR-004); this adapter only checks the folder is still reachable.

export const googleDriveAdapter: DestinationAdapter = {
  type: "google_drive",
  async test(destination) {
    const config = driveConfig.safeParse(destination.config);
    if (!config.success || !destination.googleConnectionId) return failure("This Drive connection is incomplete. Remove it and add it again.", false);
    const token = await googleAccessToken(destination.googleConnectionId);
    const folder = await getFile(token, config.data.folderId);
    return folder.trashed ? failure("The uploads folder is in the Drive trash. Restore it or connect a new folder.", false) : success;
  },
};
