"use client";

import { ArrowLeft, Eye, MoreVertical, Redo2, Share2, Undo2 } from "lucide-react";
import NextLink from "next/link";

import { Button, cx } from "@/components/aiesec";
import { Menu } from "@/components/app/Menu";

import { SaveStatus } from "./SaveStatus";
import type { SaveStatus as Status } from "./useAutosave";

export type BuilderTab = "questions" | "connect" | "settings";

const TABS: Array<{ id: BuilderTab; label: string }> = [
  { id: "questions", label: "Questions" },
  { id: "connect", label: "Connect" },
  { id: "settings", label: "Settings" },
];

type Props = {
  title: string;
  status: Status;
  tab: BuilderTab;
  onTab: (tab: BuilderTab) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPreview: () => void;
  onShare: () => void;
  onPublish: () => void;
  publishLabel: string;
  publishDisabled: boolean;
  publishing: boolean;
  connectAttention: boolean;
};

const iconButton = "inline-flex size-10 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text disabled:cursor-not-allowed disabled:opacity-45";

export function TopBar(props: Props) {
  const { title, status, tab, onTab, canUndo, canRedo, onUndo, onRedo, onPreview, onShare, onPublish, publishLabel, publishDisabled, publishing, connectAttention } = props;

  const tabs = (
    <div role="tablist" aria-label="Form editor sections" className="flex h-full items-stretch gap-1">
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`tab-${item.id}`}
          aria-selected={tab === item.id}
          aria-controls={`panel-${item.id}`}
          tabIndex={tab === item.id ? 0 : -1}
          onClick={() => onTab(item.id)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            event.preventDefault();
            const index = TABS.findIndex((entry) => entry.id === tab);
            const next = TABS[(index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length];
            onTab(next.id);
            document.getElementById(`tab-${next.id}`)?.focus();
          }}
          className="ae-tab ae-label relative flex flex-1 items-center justify-center gap-2 px-3 lg:flex-none"
        >
          {item.label}
          {item.id === "connect" && connectAttention && (
            <span className="inline-block size-2 rounded-full bg-danger" aria-label="needs attention" />
          )}
        </button>
      ))}
    </div>
  );

  return (
    <header className="shrink-0 border-b border-border bg-bg">
      {/* One set of tabs: a second row on phones, centred inline from 1024px. */}
      <div className="flex flex-wrap items-center gap-x-2 px-2 sm:px-4 lg:flex-nowrap">
        <div className="flex h-16 min-w-0 flex-1 items-center gap-2 lg:flex-none">
          <NextLink href="/forms" aria-label="Back to your forms" className={iconButton}>
            <ArrowLeft size={20} aria-hidden="true" />
          </NextLink>
          <p className="truncate ae-label text-text lg:max-w-64" title={title}>
            {title || "Untitled form"}
          </p>
          <span className="hidden sm:inline-flex">
            <SaveStatus status={status} />
          </span>
          <span className="sm:hidden">
            <SaveStatus status={status} compact />
          </span>
        </div>
        <nav aria-label="Editor sections" className="order-last -mx-2 flex h-12 w-full justify-center border-t border-border px-2 sm:-mx-4 sm:px-4 lg:order-none lg:mx-0 lg:h-16 lg:w-auto lg:flex-1 lg:border-t-0 lg:px-0">
          {tabs}
        </nav>
        <div className="flex h-16 items-center gap-1 lg:order-last">
          <div className="hidden items-center lg:flex">
            <button type="button" className={iconButton} aria-label="Undo" aria-keyshortcuts="Control+Z" disabled={!canUndo} onClick={onUndo}>
              <Undo2 size={18} aria-hidden="true" />
            </button>
            <button type="button" className={iconButton} aria-label="Redo" aria-keyshortcuts="Control+Shift+Z" disabled={!canRedo} onClick={onRedo}>
              <Redo2 size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Button variant="ghost" iconStart={<Eye size={18} aria-hidden="true" />} onClick={onPreview}>
              Preview
            </Button>
            <Button variant="secondary" iconStart={<Share2 size={18} aria-hidden="true" />} onClick={onShare}>
              Share
            </Button>
          </div>
          <span className="sm:hidden">
            <Menu
              label="More actions"
              trigger={<MoreVertical size={20} aria-hidden="true" />}
              items={[
                { label: "Undo", icon: <Undo2 size={16} />, disabled: !canUndo, onSelect: onUndo },
                { label: "Redo", icon: <Redo2 size={16} />, disabled: !canRedo, onSelect: onRedo },
                { kind: "separator" },
                { label: "Preview", icon: <Eye size={16} />, onSelect: onPreview },
                { label: "Share", icon: <Share2 size={16} />, onSelect: onShare },
              ]}
            />
          </span>
          <Button variant="primary" onClick={onPublish} disabled={publishDisabled} loading={publishing} className={cx("ml-1", publishDisabled && "pointer-events-none")}>
            {publishLabel}
          </Button>
        </div>
      </div>
    </header>
  );
}
