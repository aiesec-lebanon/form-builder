import { CircleDot, CirclePause, PencilLine } from "lucide-react";

import { Badge } from "@/components/aiesec";
import { availability, type AvailabilityInput } from "@/lib/forms/availability";

export type FormStatus = "draft" | "live" | "closed";

export function formStatus(form: AvailabilityInput & { publishedAt: Date | string | null }): FormStatus {
  if (!form.publishedAt) return "draft";
  return availability(form).open ? "live" : "closed";
}

/** Status with an icon and a word, never colour alone. */
export function StatusBadge({ status }: { status: FormStatus }) {
  if (status === "live") {
    return (
      <Badge tone="success" icon={<CircleDot size={14} aria-hidden="true" />}>
        Live
      </Badge>
    );
  }
  if (status === "closed") {
    return (
      <Badge tone="warning" icon={<CirclePause size={14} aria-hidden="true" />}>
        Closed
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" icon={<PencilLine size={14} aria-hidden="true" />}>
      Draft
    </Badge>
  );
}
