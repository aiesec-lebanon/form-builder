"use client";

import { CircleAlert } from "lucide-react";

import { Button } from "@/components/aiesec";
import type { PublishProblem } from "@/lib/forms/publish-checks";

import { Sheet } from "./Sheet";

type Props = {
  problems: PublishProblem[] | null;
  onClose: () => void;
  onFix: (problem: PublishProblem) => void;
};

/** Lists what blocks publishing, each with a direct "Fix" jump. */
export function PublishProblemsDialog({ problems, onClose, onFix }: Props) {
  return (
    <Sheet open={problems !== null} onClose={onClose} title="A few things before you publish" width={560}>
      <ul role="list" className="flex flex-col gap-2">
        {(problems ?? []).map((problem) => (
          <li key={problem.id} className="flex items-center gap-3 rounded-md border border-border p-3">
            <CircleAlert size={18} aria-hidden="true" className="shrink-0 text-danger-text" />
            <span className="flex-1 ae-body-sm text-text">{problem.message}</span>
            <Button size="sm" variant="tertiary" onClick={() => onFix(problem)}>
              Fix
            </Button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
