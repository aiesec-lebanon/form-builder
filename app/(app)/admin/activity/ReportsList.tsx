import { Badge } from "@/components/aiesec";
import type { ActivityQuery } from "@/lib/admin/activity-query";
import { REPORT_REASON_LABEL, type ReportReason } from "@/lib/forms/reports";

import { ReportActions } from "./ReportActions";
import { PlainHeader, SortHeader, When } from "./table-parts";

export type ReportRow = {
  id: string;
  reason: string;
  details: string | null;
  contact: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  form: { id: string; title: string; slug: string; acceptingResponses: boolean; deletedAt: Date | null; owner: { fullName: string; email: string | null } };
};

/** Reports from the public form footer, one page at a time. */
export function ReportsTable({ query, reports, filtered }: { query: ActivityQuery; reports: ReportRow[]; filtered: boolean }) {
  return (
    <div className="ae-table-wrap">
      <table className="ae-table min-w-[44rem]">
        <caption className="ae-sr-only">Reported forms</caption>
        <thead>
          <tr>
            <SortHeader query={query} column="form">
              Form
            </SortHeader>
            <SortHeader query={query} column="reason">
              Reason
            </SortHeader>
            <SortHeader query={query} column="when">
              When
            </SortHeader>
            <PlainHeader>
              <span className="ae-sr-only">Actions</span>
            </PlainHeader>
          </tr>
        </thead>
        <tbody>
          {reports.length === 0 ? (
            <tr>
              <td colSpan={4} className="ae-table__empty ae-body-sm">
                {filtered ? "No reports match these filters." : "No open reports. When someone reports a form from its footer, it shows up here."}
              </td>
            </tr>
          ) : (
            reports.map((report) => {
              const form = report.form;
              const formOpen = form.acceptingResponses && !form.deletedAt;
              return (
                <tr key={report.id}>
                  <td>
                    <span className="flex flex-col items-start gap-1">
                      <a href={`/f/${form.slug}`} target="_blank" rel="noopener" className="ae-link ae-label">
                        {form.title || "Untitled form"}
                      </a>
                      <span className="ae-caption text-text-muted">
                        By {form.owner.fullName}
                        {form.owner.email ? ` · ${form.owner.email}` : ""}
                      </span>
                      {!formOpen && <Badge tone="neutral">{form.deletedAt ? "In trash" : "Closed"}</Badge>}
                    </span>
                  </td>
                  <td className="max-w-[36ch]">
                    <span className="flex flex-col gap-1">
                      <span className="ae-body-sm text-text">{REPORT_REASON_LABEL[report.reason as ReportReason] ?? report.reason}</span>
                      {report.details && <span className="whitespace-pre-line break-words ae-body-sm text-text-muted">{report.details}</span>}
                      {report.contact && <span className="ae-caption text-text-muted">Reporter: {report.contact}</span>}
                    </span>
                  </td>
                  <td>
                    <When date={report.createdAt} />
                  </td>
                  <td>{report.reviewedAt ? <Badge tone="success">Reviewed</Badge> : <ReportActions reportId={report.id} formId={form.id} formOpen={formOpen} />}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
