"use client";

import { Crown, LogOut, Mail, MoreHorizontal, UserMinus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Avatar, Badge, Button, Modal, TextField, useToast } from "@/components/aiesec";
import { addCollaborator, removeCollaborator, revokeInvite, transferOwnership } from "@/actions/collaborators";
import { Menu } from "@/components/app/Menu";
import type { Collaboration, Person } from "@/lib/forms/collaboration";

type Props = { formId: string; initial: Collaboration };

function PersonRow({ person, badge, actions }: { person: Person; badge?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar name={person.name} src={person.photoUrl ?? undefined} size="md" decorative />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-2 ae-label text-text">
          {person.name}
          {badge}
        </span>
        <span className="truncate ae-caption text-text-muted">{person.detail ?? person.email ?? ""}</span>
      </div>
      {actions}
    </li>
  );
}

export function CollaboratorsPanel({ formId, initial }: Props) {
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [identifier, setIdentifier] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [transferTo, setTransferTo] = React.useState<Person | null>(null);
  const [pending, startTransition] = React.useTransition();

  const apply = (result: Awaited<ReturnType<typeof addCollaborator>>, success?: string) => {
    if (!result.ok) {
      toast.show({ tone: "danger", title: "That didn't work", description: result.error });
      return false;
    }
    setData(result.data);
    if (success) toast.show({ title: success });
    return true;
  };

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await addCollaborator(formId, identifier);
      if (!result.ok) {
        setFieldError(result.fieldErrors?.identifier ?? result.error);
        return;
      }
      setFieldError(null);
      setIdentifier("");
      const invited = result.data.invites.length > data.invites.length;
      apply(result, invited ? "Invite saved. They get access when they sign in." : "Editor added");
    });
  };

  const leave = () =>
    startTransition(async () => {
      const result = await removeCollaborator(formId, data.viewerId);
      if (!result.ok) return void toast.show({ tone: "danger", title: "Couldn't leave the form", description: result.error });
      router.push("/forms");
    });

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="ae-h4">People with access</h2>
        <p className="ae-body-sm text-text-muted">Editors can change questions, destinations and settings. At handover, make the next responsible the owner.</p>
      </div>

      {data.viewerIsOwner && (
        <form onSubmit={add} className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate>
          <div className="flex-1">
            <TextField
              label="Add an editor"
              hint="Their email address or EXPA ID. If they haven't signed in yet, they get access when they do."
              placeholder="name@aiesec.net"
              value={identifier}
              error={fieldError ?? undefined}
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" loading={pending} iconStart={<UserPlus size={18} aria-hidden="true" />} className="sm:mt-7">
            Add
          </Button>
        </form>
      )}

      <ul role="list" className="flex flex-col divide-y divide-border">
        <PersonRow person={data.owner} badge={<Badge tone="info">Owner</Badge>} />
        {data.editors.map((editor) => (
          <PersonRow
            key={editor.id}
            person={editor}
            badge={editor.id === data.viewerId ? <Badge tone="neutral">You</Badge> : undefined}
            actions={
              data.viewerIsOwner ? (
                <Menu
                  label={`Manage ${editor.name}`}
                  trigger={<MoreHorizontal size={20} aria-hidden="true" />}
                  triggerClassName="ae-btn ae-btn--ghost ae-btn--icon ae-btn--sm"
                  items={[
                    { label: "Make owner", icon: <Crown size={16} />, onSelect: () => setTransferTo(editor) },
                    {
                      label: "Remove access",
                      icon: <UserMinus size={16} />,
                      tone: "danger",
                      onSelect: () =>
                        startTransition(async () => {
                          const result = await removeCollaborator(formId, editor.id);
                          if (!result.ok) return void toast.show({ tone: "danger", title: "Couldn't remove access", description: result.error });
                          if ("owner" in result.data) {
                            setData(result.data);
                            toast.show({ title: "Access removed" });
                          }
                        }),
                    },
                  ]}
                />
              ) : editor.id === data.viewerId ? (
                <Button size="sm" variant="ghost" iconStart={<LogOut size={16} aria-hidden="true" />} onClick={leave} loading={pending}>
                  Leave
                </Button>
              ) : undefined
            }
          />
        ))}
        {data.invites.map((invite) => (
          <li key={invite.id} className="flex items-center gap-3 py-3">
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-fill text-text-muted">
              <Mail size={16} aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate ae-label text-text">{invite.email}</span>
              <span className="ae-caption text-text-muted">Invited · gets access on first sign-in</span>
            </div>
            {data.viewerIsOwner && (
              <Button size="sm" variant="ghost" onClick={() => startTransition(async () => void apply(await revokeInvite(formId, invite.id), "Invite cancelled"))}>
                Cancel invite
              </Button>
            )}
          </li>
        ))}
      </ul>

      <Modal
        open={transferTo !== null}
        onClose={() => setTransferTo(null)}
        title={`Make ${transferTo?.name ?? "this editor"} the owner?`}
        size="sm"
        footer={
          <>
            <Button data-autofocus onClick={() => setTransferTo(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  if (!transferTo) return;
                  const done = apply(await transferOwnership(formId, transferTo.id), "Ownership transferred");
                  if (done) setTransferTo(null);
                })
              }
            >
              Make owner
            </Button>
          </>
        }
      >
        <p>They&apos;ll be able to delete the form and manage who has access. You&apos;ll stay on as an editor.</p>
      </Modal>
    </section>
  );
}
