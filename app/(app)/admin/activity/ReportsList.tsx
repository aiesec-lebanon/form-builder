import { Badge } from "@/components/aiesec";
import { RelativeTime } from "@/components/app/RelativeTime";
import { db } from "@/lib/db";
import { REPORT_REASON_LABEL, type ReportReason } from "@/lib/forms/reports";

import { ReportActions } from "./ReportActions";

/** Reports from the public form footer: open ones first, then the latest reviewed. */
export async function ReportsList() {
  const include = { form: { select: { id: true, title: true, slug: true, acceptingResponses: true, deletedAt: true, owner: { select: { fullName: true, email: true } } } } } as const;
  const [open, reviewed] = await Promise.all([
    db.formReport.findMany({ where: { reviewedAt: null }, orderBy: { createdAt: "desc" }, take: 100, include }),
    db.formReport.findMany({ where: { reviewedAt: { not: null } }, orderBy: { reviewedAt: "desc" }, take: 20, include }),
  ]);
  const reports = [...open, ...reviewed];

  if (reports.length === 0) return <p className="rounded-lg border border-dashed border-border-strong p-8 ae-body text-text-muted">No reports. When someone reports a form from its footer, it shows up here.</p>;

  return (
    <div className="ae-table-wrap">
      <table className="ae-table">
        <caption className="ae-sr-only">Reported forms</caption>
        <thead>
          <tr>
            <th scope="col" className="ae-label">
              Form
            </th>
            <th scope="col" className="ae-label">
              Report
            </th>
            <th scope="col" className="ae-label">
              When
            </th>
            <th scope="col" className="ae-label">
              <span className="ae-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const form = report.form;
            const formOpen = form.acceptingResponses && !form.deletedAt;
            return (
              <tr key={report.id}>
                <td>
                  <span className="flex flex-col gap-1">
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
                <td className="ae-body-sm text-text-muted">
                  <RelativeTime value={report.createdAt} />
                </td>
                <td>{report.reviewedAt ? <Badge tone="success">Reviewed</Badge> : <ReportActions reportId={report.id} formId={form.id} formOpen={formOpen} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
