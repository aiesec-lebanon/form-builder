"use client";

import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { Alert, Badge, Button, useToast } from "@/components/aiesec";
import type { DestinationSummary, DestinationType } from "@/lib/destinations/types";
import type { FormDocument } from "@/lib/forms/schema";

import { Sheet } from "../Sheet";
import { DestinationCard } from "./DestinationCard";
import { SetupSheet } from "./SetupSheet";
import { DESTINATION_META, type GoogleAccount } from "./shared";

type Props = {
  formId: string;
  destinations: DestinationSummary[];
  onDestinations: (destinations: DestinationSummary[]) => void;
  googleConfigured: boolean;
  googlePicker?: boolean;
  googleAccounts: GoogleAccount[];
  hasFileQuestions: boolean;
  doc?: FormDocument;
};

const RESPONSE_TYPES: DestinationType[] = ["google_sheets", "webhook", "supabase", "postgres"];

const GOOGLE_ERRORS: Record<string, string> = {
  denied: "Google access wasn't granted.",
  expired: "That Google sign-in expired. Try again.",
  drive_scope: "Allow access to files created by AIESEC Forms, then try again.",
  not_configured: "Google isn't set up on this server yet.",
  domain: "Connect your AIESEC Google account (your @aiesec.net email). Sheets and upload folders are created in that account's Drive, so personal accounts can't be used.",
  failed: "Google couldn't be connected. Try again.",
};

function Chooser({ onChoose, googleConfigured }: { onChoose: (type: DestinationType) => void; googleConfigured: boolean }) {
  return (
    <ul role="list" className="grid gap-3 sm:grid-cols-2">
      {RESPONSE_TYPES.map((type) => {
        const meta = DESTINATION_META[type];
        const Icon = meta.icon;
        const recommended = type === "google_sheets" && googleConfigured;
        return (
          <li key={type}>
            <button
              type="button"
              onClick={() => onChoose(type)}
              className="group flex h-full w-full items-start gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors duration-150 hover:border-border-strong hover:bg-fill"
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-fill text-text group-hover:bg-surface">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="ae-label text-text">{meta.name}</span>
                  {recommended && <Badge tone="info">Recommended</Badge>}
                </span>
                <span className="ae-body-sm text-text-muted">{meta.blurb}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ConnectPanel({ formId, destinations, onDestinations, googleConfigured, googlePicker, googleAccounts, hasFileQuestions, doc }: Props) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [choosing, setChoosing] = React.useState(false);
  // Coming back from Google: continue the setup that sent people there.
  const [setup, setSetup] = React.useState<DestinationType | null>(() => {
    const resume = params.get("setup");
    return params.get("google") === "connected" && (resume === "google_sheets" || resume === "google_drive") ? resume : null;
  });

  const responseDestinations = destinations.filter((destination) => destination.role !== "files");
  const drive = destinations.find((destination) => destination.role === "files") ?? null;
  const googleReturnTo = `${pathname}?tab=connect`;

  React.useEffect(() => {
    const connected = params.get("google") === "connected";
    const error = params.get("google_error");
    if (!connected && !error) return;
    if (connected) toast.show({ title: "Google connected" });
    if (error) toast.show({ tone: "danger", title: "Google wasn't connected", description: GOOGLE_ERRORS[error] ?? GOOGLE_ERRORS.failed });
    router.replace(`${pathname}?tab=connect`, { scroll: false });
  }, [params, pathname, router, toast]);

  const choose = (type: DestinationType) => {
    setChoosing(false);
    setSetup(type);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6 lg:py-10">
      <section aria-labelledby="responses-heading" className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="responses-heading" className="ae-h4">
              Where responses go
            </h2>
            <p className="ae-body-sm text-text-muted">Each response goes straight to your destination. AIESEC Forms never stores answers.</p>
          </div>
          {responseDestinations.length > 0 && (
            <Button size="sm" iconStart={<Plus size={16} aria-hidden="true" />} onClick={() => setChoosing(true)}>
              Add destination
            </Button>
          )}
        </div>

        {responseDestinations.length === 0 ? (
          <Chooser onChoose={choose} googleConfigured={googleConfigured} />
        ) : (
          <div className="flex flex-col gap-3">
            {responseDestinations.map((destination) => (
              <DestinationCard key={destination.id} formId={formId} destination={destination} isOnlyResponseDestination={responseDestinations.length === 1} onDestinations={onDestinations} doc={doc} />
            ))}
            {responseDestinations.length > 1 && (
              <p className="ae-caption text-text-muted">A response counts as sent when the primary destination accepts it. Others receive a copy right after.</p>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="files-heading" className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="files-heading" className="ae-h4">
            File uploads
          </h2>
          <p className="ae-body-sm text-text-muted">Files people upload go straight to a folder in your Google Drive. Their links appear with each response.</p>
        </div>
        {hasFileQuestions && !drive && (
          <Alert tone="warning" title="Your form has a file question">
            Connect Google Drive so uploads have somewhere to go. You can&apos;t publish until you do.
          </Alert>
        )}
        {drive ? (
          <DestinationCard formId={formId} destination={drive} isOnlyResponseDestination={false} onDestinations={onDestinations} />
        ) : (
          <div>
            <Button onClick={() => setSetup("google_drive")} iconStart={<Plus size={16} aria-hidden="true" />}>
              Connect Google Drive
            </Button>
          </div>
        )}
      </section>

      <Sheet open={choosing} onClose={() => setChoosing(false)} title="Add a destination" width={640}>
        <Chooser onChoose={choose} googleConfigured={googleConfigured} />
      </Sheet>
      <SetupSheet
        key={setup ?? "none"}
        type={setup}
        formId={formId}
        onClose={() => setSetup(null)}
        onDestinations={onDestinations}
        googleConfigured={googleConfigured}
        googlePicker={googlePicker ?? false}
        googleAccounts={googleAccounts}
        googleReturnTo={googleReturnTo}
      />
    </div>
  );
}
