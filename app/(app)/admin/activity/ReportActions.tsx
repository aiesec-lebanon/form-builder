"use client";

import * as React from "react";

import { closeReportedForm, markReportReviewed } from "@/actions/admin";
import { Button, useToast } from "@/components/aiesec";

/** Close a reported form, or mark the report as looked at. */
export function ReportActions({ reportId, formId, formOpen }: { reportId: string; formId: string; formOpen: boolean }) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await action();
      toast.show(result.ok ? { title: success } : { title: "That didn't work", description: result.error, tone: "danger" });
    });

  return (
    <div className="flex flex-wrap gap-2">
      {formOpen && (
        <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => closeReportedForm(formId), "Form closed. It no longer takes responses.")}>
          Close form
        </Button>
      )}
      <Button size="sm" disabled={pending} onClick={() => run(() => markReportReviewed(reportId), "Marked as reviewed")}>
        Mark reviewed
      </Button>
    </div>
  );
}
