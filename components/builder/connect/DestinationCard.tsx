"use client";

import { CircleAlert, CircleCheck, CircleDashed, Columns3, ExternalLink, KeyRound, MoreHorizontal, Star, Trash2 } from "lucide-react";
import * as React from "react";

import { Badge, Button, Modal, useToast } from "@/components/aiesec";
import { makePrimary, removeDestination, revealWebhookSecret, testDestinationAction } from "@/actions/destinations";
import { CopyBlock } from "@/components/app/CopyBlock";
import { Menu, type MenuItem } from "@/components/app/Menu";
import { RelativeTime } from "@/components/app/RelativeTime";
import { columnsViewSql } from "@/lib/destinations/sql";
import type { DestinationSummary } from "@/lib/destinations/types";
import type { FormDocument } from "@/lib/forms/schema";

import { DESTINATION_META, WEBHOOK_VERIFY_SNIPPET } from "./shared";

type Props = {
  formId: string;
  destination: DestinationSummary;
  isOnlyResponseDestination: boolean;
  onDestinations: (destinations: DestinationSummary[]) => void;
  /** The form's questions, for the per-question view SQL. */
  doc?: FormDocument;
};

function Health({ destination }: { destination: DestinationSummary }) {
  if (destination.health === "failing") {
    return (
      <p className="flex items-start gap-1.5 ae-body-sm font-bold text-danger-text">
        <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          <span className="sr-only">Failing: </span>
          {destination.lastError ?? "The last delivery failed."}
        </span>
      </p>
    );
  }
  if (destination.health === "working" && destination.lastSuccessAt) {
    return (
      <p className="flex items-center gap-1.5 ae-body-sm text-success-text">
        <CircleCheck size={16} aria-hidden="true" />
        <span>
          Working · <RelativeTime value={destination.lastSuccessAt} prefix="last checked" />
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 ae-body-sm text-text-muted">
      <CircleDashed size={16} aria-hidden="true" />
      Not tested yet
    </p>
  );
}

export function DestinationCard({ formId, destination, isOnlyResponseDestination, onDestinations, doc }: Props) {
  const toast = useToast();
  const [testing, startTest] = React.useTransition();
  const [busy, startBusy] = React.useTransition();
  const [confirming, setConfirming] = React.useState(false);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [viewOpen, setViewOpen] = React.useState(false);
  const meta = DESTINATION_META[destination.type];
  const Icon = meta.icon;
  const isFiles = destination.role === "files";

  const test = () =>
    startTest(async () => {
      const result = await testDestinationAction(formId, destination.id);
      if (!result.ok) return void toast.show({ tone: "danger", title: "Couldn't run the test", description: result.error });
      onDestinations(result.data.destinations);
      toast.show(result.data.passed ? { title: `${meta.name} is working` } : { tone: "danger", title: `${meta.name} didn't accept the test`, description: result.data.message ?? undefined });
    });

  const remove = () =>
    startBusy(async () => {
      const result = await removeDestination(formId, destination.id);
      setConfirming(false);
      if (!result.ok) return void toast.show({ tone: "danger", title: "Couldn't remove it", description: result.error });
      onDestinations(result.data.destinations);
      toast.show({ title: `${meta.name} removed` });
    });

  const items: MenuItem[] = [
    ...(destination.link ? [{ label: destination.type === "google_drive" ? "Open folder" : "Open Sheet", icon: <ExternalLink size={16} />, onSelect: () => window.open(destination.link as string, "_blank", "noopener") }] : []),
    ...(destination.role === "secondary"
      ? [
          {
            label: "Make primary",
            icon: <Star size={16} />,
            onSelect: () =>
              startBusy(async () => {
                const result = await makePrimary(formId, destination.id);
                if (result.ok) onDestinations(result.data.destinations);
              }),
          },
        ]
      : []),
    ...(destination.type === "webhook"
      ? [
          {
            label: "Show signing secret",
            icon: <KeyRound size={16} />,
            onSelect: () =>
              startBusy(async () => {
                const result = await revealWebhookSecret(formId, destination.id);
                if (result.ok) setSecret(result.data.signingSecret);
                else toast.show({ tone: "danger", title: "Couldn't show the secret", description: result.error });
              }),
          },
        ]
      : []),
    ...(destination.table && doc ? [{ label: "One column per question (SQL)", icon: <Columns3 size={16} />, onSelect: () => setViewOpen(true) }] : []),
    { kind: "separator" },
    { label: "Remove", icon: <Trash2 size={16} />, tone: "danger", onSelect: () => setConfirming(true) },
  ];

  return (
    <article aria-busy={busy || undefined} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-fill text-text">
          <Icon size={20} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="ae-label text-text">{destination.name}</h3>
            {destination.role === "primary" && <Badge tone="info">Primary</Badge>}
            {destination.role === "secondary" && <Badge tone="neutral">Also sends here</Badge>}
          </div>
          <p className="truncate ae-body-sm text-text-muted">
            {destination.detail}
            {destination.connectedVia ? ` · ${destination.connectedVia}` : ""}
          </p>
          <Health destination={destination} />
        </div>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-center">
        <Button size="sm" onClick={test} loading={testing}>
          {isFiles ? "Check folder" : "Send test"}
        </Button>
        <Menu label={`More actions for ${destination.name}`} trigger={<MoreHorizontal size={20} aria-hidden="true" />} triggerClassName="ae-btn ae-btn--ghost ae-btn--icon ae-btn--sm" items={items} />
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Remove ${destination.name}?`}
        size="sm"
        footer={
          <>
            <Button data-autofocus onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              Remove
            </Button>
          </>
        }
      >
        <p>
          {isFiles
            ? "New uploads will have nowhere to go, so file questions will stop the form from publishing. Files already uploaded stay in your Drive."
            : isOnlyResponseDestination
              ? "This is the only place responses go. The live form will show an error to respondents until you connect another destination."
              : "Responses will stop going here."}{" "}
          {destination.type === "google_sheets" && "The Sheet itself stays in your Google Drive."}
        </p>
      </Modal>

      {destination.table && doc && (
        <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="One column per question" size="lg">
          <div className="flex flex-col gap-4">
            <p className="ae-body-sm text-text-muted">
              Responses arrive in one row each, with every answer inside the data column. Run this in your database to get a view with one column per question, ready for
              spreadsheets and dashboards. Run it again after you change the questions.
            </p>
            <CopyBlock label="View SQL" value={columnsViewSql({ doc, formId, schema: destination.table.schema, table: destination.table.name })} />
          </div>
        </Modal>
      )}

      <Modal open={secret !== null} onClose={() => setSecret(null)} title="Webhook signing secret" size="lg">
        <div className="flex flex-col gap-4">
          <p className="ae-body-sm text-text-muted">Use it to check that requests really come from AIESEC Forms. Keep it private.</p>
          {secret && <CopyBlock label="Signing secret" value={secret} wrap />}
          <CopyBlock label="Verification example" value={WEBHOOK_VERIFY_SNIPPET} />
        </div>
      </Modal>
    </article>
  );
}
