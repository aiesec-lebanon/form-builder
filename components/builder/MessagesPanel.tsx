"use client";

import { BadgeCheck, Inbox, Mail, Trash2 } from "lucide-react";
import * as React from "react";

import { deleteMessage, markMessageRead } from "@/actions/messages";
import { Button, Modal, cx, useToast } from "@/components/aiesec";
import { RelativeTime } from "@/components/app/RelativeTime";
import type { MessageSummary } from "@/lib/forms/messages";

// Messages from "Contact form owner" (ADR-017). Opening one marks it read;
// replies go through the owner's own mail app.

type Props = {
  formId: string;
  messages: MessageSummary[];
  onMessages: (messages: MessageSummary[]) => void;
};

export function MessagesPanel({ formId, messages, onMessages }: Props) {
  const toast = useToast();
  const [deleting, setDeleting] = React.useState<MessageSummary | null>(null);
  const [pending, startTransition] = React.useTransition();

  const markRead = (message: MessageSummary) => {
    if (message.readAt) return;
    onMessages(messages.map((item) => (item.id === message.id ? { ...item, readAt: new Date().toISOString() } : item)));
    void markMessageRead(formId, message.id);
  };

  const remove = (message: MessageSummary) =>
    startTransition(async () => {
      const result = await deleteMessage(formId, message.id);
      if (!result.ok) {
        toast.show({ title: "Couldn't delete the message", description: result.error, tone: "danger" });
        return;
      }
      onMessages(messages.filter((item) => item.id !== message.id));
      setDeleting(null);
      toast.show({ title: "Message deleted" });
    });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6 lg:py-10">
      <div className="flex flex-col gap-1">
        <h2 className="ae-h3">Messages</h2>
        <p className="ae-body-sm text-text-muted">People write to you from &ldquo;Contact form owner&rdquo; at the bottom of your form. Your email stays private; reply to theirs.</p>
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
          <Inbox size={28} aria-hidden="true" className="text-text-muted" />
          <p className="ae-label text-text">No messages yet</p>
          <p className="max-w-sm ae-body-sm text-text-muted">When someone uses &ldquo;Contact form owner&rdquo; on your form, their message shows up here.</p>
        </div>
      ) : (
        <ul role="list" className="flex flex-col gap-3">
          {messages.map((message) => {
            const unread = !message.readAt;
            const reply = `mailto:${message.senderEmail}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`;
            return (
              <li key={message.id} className="rounded-lg border border-border bg-surface">
                <details onToggle={(event) => event.currentTarget.open && markRead(message)}>
                  <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg p-4 hover:bg-fill [&::-webkit-details-marker]:hidden">
                    <span aria-hidden="true" className={cx("mt-2 size-2 shrink-0 rounded-full", unread ? "bg-primary" : "bg-transparent")} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className={cx("ae-body text-text", unread && "font-bold")}>{message.senderName}</span>
                        {message.verified && (
                          <span className="inline-flex items-center gap-1 ae-caption text-success-text" title="Name and email come from an AIESEC sign-in">
                            <BadgeCheck size={14} aria-hidden="true" />
                            AIESEC sign-in
                          </span>
                        )}
                        <span className="ml-auto ae-caption text-text-muted">
                          <RelativeTime value={message.createdAt} />
                        </span>
                      </span>
                      <span className={cx("truncate ae-body-sm", unread ? "text-text" : "text-text-muted")}>{message.subject}</span>
                      {unread && <span className="sr-only">Unread</span>}
                    </span>
                  </summary>
                  <div className="flex flex-col gap-4 border-t border-border p-4 sm:pl-9">
                    <p className="ae-body-sm break-all text-text-muted">
                      From {message.senderName} · {message.senderEmail}
                    </p>
                    <p className="whitespace-pre-wrap break-words ae-body text-text">{message.body}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button as="a" href={reply} variant="primary" size="sm" iconStart={<Mail size={16} aria-hidden="true" />}>
                        Reply by email
                      </Button>
                      <Button size="sm" variant="tertiary" iconStart={<Trash2 size={16} aria-hidden="true" />} onClick={() => setDeleting(message)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <p className="ae-caption text-text-muted">Everyone who can edit this form sees these messages. They&apos;re deleted after a year.</p>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this message?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setDeleting(null)} data-autofocus>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={() => deleting && remove(deleting)}>
              Delete message
            </Button>
          </>
        }
      >
        <p className="ae-body">It&apos;s deleted for everyone who edits this form. You can&apos;t undo this.</p>
      </Modal>
    </div>
  );
}
