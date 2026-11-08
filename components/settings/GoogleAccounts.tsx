"use client";

import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Alert, Button, Modal, useToast } from "@/components/aiesec";
import { disconnectGoogle } from "@/actions/google";
import { RelativeTime } from "@/components/app/RelativeTime";

type Connection = { id: string; email: string; revoked: boolean; connectedAt: string; usedBy: number };

const NOTICES: Record<string, { tone: "success" | "danger"; text: string }> = {
  connected: { tone: "success", text: "Google connected." },
  denied: { tone: "danger", text: "Google access wasn't granted." },
  expired: { tone: "danger", text: "That Google sign-in expired. Try again." },
  drive_scope: { tone: "danger", text: "Allow access to files created by AIESEC Forms, then try again." },
  not_configured: { tone: "danger", text: "Google isn't set up on this server yet." },
  domain: { tone: "danger", text: "Connect your AIESEC Google account (your @aiesec.net email). Sheets and upload folders are created in that account's Drive, so personal accounts can't be used." },
  failed: { tone: "danger", text: "Google couldn't be connected. Try again." },
};

export function GoogleAccounts({ configured, connections, notice }: { configured: boolean; connections: Connection[]; notice: string | null }) {
  const toast = useToast();
  const router = useRouter();
  const [confirming, setConfirming] = React.useState<Connection | null>(null);
  const [pending, startTransition] = React.useTransition();
  const message = notice ? (NOTICES[notice] ?? NOTICES.failed) : null;

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <Alert tone={message.tone} live>
          {message.text}
        </Alert>
      )}
      {!configured && <Alert tone="info">Google isn&apos;t set up on this server yet. Ask your platform admin to add the Google OAuth client.</Alert>}
      {connections.length > 0 && (
        <ul role="list" className="flex flex-col divide-y divide-border rounded-md border border-border">
          {connections.map((connection) => (
            <li key={connection.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate ae-label text-text">{connection.email}</span>
                <span className="ae-caption text-text-muted">
                  {connection.revoked ? (
                    <span className="inline-flex items-center gap-1 font-bold text-danger-text">
                      <CircleAlert size={14} aria-hidden="true" /> Access removed. Reconnect to keep sending.
                    </span>
                  ) : (
                    <>
                      <RelativeTime value={connection.connectedAt} prefix="Connected" /> · used by {connection.usedBy} destination{connection.usedBy === 1 ? "" : "s"}
                    </>
                  )}
                </span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(connection)}>
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}
      {configured && (
        <div>
          <Button as="a" href="/api/google/connect?returnTo=%2Fsettings">
            {connections.length ? "Connect another account" : "Connect Google"}
          </Button>
        </div>
      )}

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Disconnect this Google account?"
        size="sm"
        footer={
          <>
            <Button data-autofocus onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  if (!confirming) return;
                  const result = await disconnectGoogle(confirming.id);
                  setConfirming(null);
                  if (!result.ok) return void toast.show({ tone: "danger", title: "Couldn't disconnect", description: result.error });
                  toast.show({ title: "Google disconnected" });
                  router.refresh();
                })
              }
            >
              Disconnect
            </Button>
          </>
        }
      >
        <p>
          {confirming && confirming.usedBy > 0
            ? `${confirming.usedBy} destination${confirming.usedBy === 1 ? "" : "s"} will stop receiving responses until you connect Google again. Your Sheets and files stay in your Drive.`
            : "Your Sheets and files stay in your Drive."}
        </p>
      </Modal>
    </div>
  );
}
