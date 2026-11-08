"use client";

import * as React from "react";

import { Button, useToast } from "@/components/aiesec";
import { importAiesecEntities } from "@/actions/entities";
import type { EntityScope } from "@/lib/auth/gis";

// Fills a choice question with AIESEC entities read with the owner's own AIESEC
// sign-in (ADR-015). The list is stored in the form like typed options.

export function EntityImport({ hasOptions, onNames }: { hasOptions: boolean; onNames: (names: string[]) => void }) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [running, setRunning] = React.useState<EntityScope | null>(null);

  const run = (scope: EntityScope) => {
    setRunning(scope);
    startTransition(async () => {
      const result = await importAiesecEntities(scope);
      if (!result.ok) return void toast.show({ tone: "danger", title: "Couldn't import the list", description: result.error });
      onNames(result.data.names);
      toast.show({ title: `${result.data.names.length} options added` });
    });
  };

  return (
    <fieldset className="ae-fieldset flex flex-col gap-2">
      <legend className="ae-fieldset__legend ae-label">Fill with AIESEC entities</legend>
      <p className="ae-field__hint ae-body-sm">Uses your AIESEC sign-in.{hasOptions ? " Replaces the current options." : ""}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={pending && running === "country"} disabled={pending} onClick={() => run("country")}>
          Local committees in my country
        </Button>
        <Button size="sm" loading={pending && running === "countries"} disabled={pending} onClick={() => run("countries")}>
          Countries
        </Button>
      </div>
    </fieldset>
  );
}
