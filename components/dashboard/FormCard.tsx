"use client";

import { Copy, ExternalLink, Link2, MoreHorizontal, PencilLine, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import * as React from "react";

import { Card, useToast } from "@/components/aiesec";
import { duplicateForm, restoreForm, trashForm } from "@/actions/forms";
import { Menu, type MenuItem } from "@/components/app/Menu";
import { RelativeTime } from "@/components/app/RelativeTime";
import { StatusBadge } from "@/components/app/StatusBadge";
import { plural } from "@/lib/format";

import type { DashboardForm } from "./FormsDashboard";

export function FormCard({ form, publicBaseUrl }: { form: DashboardForm; publicBaseUrl: string }) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const trashed = form.deletedAt !== null;
  const liveUrl = `${publicBaseUrl}/f/${form.slug}`;

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.show({ tone: "danger", title: "That didn't work", description: result.error });
      else success?.();
    });

  const items: MenuItem[] = trashed
    ? [{ label: "Restore", icon: <RotateCcw size={16} />, onSelect: () => run(() => restoreForm(form.id), () => toast.show({ title: "Form restored" })) }]
    : [
        { label: "Edit", icon: <PencilLine size={16} />, href: `/forms/${form.id}/edit` },
        ...(form.status !== "draft"
          ? [
              {
                label: "Copy link",
                icon: <Link2 size={16} />,
                onSelect: () => {
                  void navigator.clipboard.writeText(liveUrl).then(() => toast.show({ title: "Link copied" }));
                },
              },
              { label: "Open live form", icon: <ExternalLink size={16} />, onSelect: () => window.open(liveUrl, "_blank", "noopener") },
            ]
          : []),
        {
          label: "Duplicate",
          icon: <Copy size={16} />,
          onSelect: () =>
            run(
              () => duplicateForm(form.id),
              () => toast.show({ title: "Copy created" }),
            ),
        },
        ...(form.isOwner
          ? ([
              { kind: "separator" },
              {
                label: "Move to trash",
                icon: <Trash2 size={16} />,
                tone: "danger",
                onSelect: () =>
                  run(
                    () => trashForm(form.id),
                    () =>
                      toast.show({
                        title: "Moved to trash",
                        description: form.title,
                        action: { label: "Undo", onClick: () => run(() => restoreForm(form.id)) },
                      }),
                  ),
              },
            ] satisfies MenuItem[])
          : []),
      ];

  const meta = (
    <>
      {trashed && form.deletedAt ? <RelativeTime value={form.deletedAt} prefix="Moved to trash" /> : <RelativeTime value={form.updatedAt} prefix="Edited" />}
      {!form.isOwner && <span> · Shared by {form.ownerName}</span>}
    </>
  );

  return (
    <Card
      title={form.title}
      href={trashed ? undefined : `/forms/${form.id}/edit`}
      meta={meta}
      aria-busy={pending || undefined}
      className="h-full"
      footer={
        <>
          <StatusBadge status={form.status} />
          {form.status !== "draft" && (
            <span className="ae-caption text-text-muted">
              {plural(form.responseCount, "response")}
              {form.completionRate !== null && <span title="Views that ended in a response"> · {form.completionRate}% complete</span>}
            </span>
          )}
          {form.failing && (
            <span className="inline-flex items-center gap-1 ae-caption font-bold text-danger-text">
              <TriangleAlert size={14} aria-hidden="true" />
              Deliveries failing
            </span>
          )}
          <span className="ml-auto" />
          <Menu label={`Actions for ${form.title}`} trigger={<MoreHorizontal size={20} aria-hidden="true" />} triggerClassName="ae-btn ae-btn--ghost ae-btn--icon ae-btn--sm" items={items} />
        </>
      }
    />
  );
}
