"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import * as React from "react";

import { PROGRAMS, Switch, TextField, Textarea, cx } from "@/components/aiesec";
import { FORM_STYLES, PROGRAM_IDS, type FormAccess, type FormDocument, type FormSettings, type FormStyle, type FormTheme } from "@/lib/forms/schema";

const STYLES: Record<FormStyle, { name: string; description: string }> = {
  calm: { name: "Calm", description: "Cool greys, flat and quiet" },
  warm: { name: "Warm", description: "Warm greys, rounder, soft shadows" },
  bold: { name: "Bold", description: "Black and white, pill buttons" },
  playful: { name: "Playful", description: "Off-white page, round shapes" },
};

type Props = {
  doc: FormDocument;
  onSettings: (patch: Partial<FormSettings>) => void;
  onTheme: (patch: Partial<FormTheme>) => void;
  children?: React.ReactNode;
};

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Only valid https links (or nothing) reach the document, so autosave never fails on a half-typed URL. */
function RedirectSetting({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const [text, setText] = React.useState(value ?? "");
  const invalid = text.trim() !== "" && !isHttps(text.trim());
  return (
    <TextField
      label="After submitting, go to this page"
      type="url"
      inputMode="url"
      placeholder="https://aiesec.org/thank-you"
      hint="Leave empty to show your confirmation message."
      error={invalid ? "Use a link that starts with https://" : undefined}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        if (!next.trim()) onChange(null);
        else if (isHttps(next.trim())) onChange(next.trim());
      }}
    />
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="ae-h4">{title}</h2>
        {description && <p className="ae-body-sm text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const MODES: Array<{ id: FormTheme["mode"]; label: string; icon: React.ReactNode }> = [
  { id: "auto", label: "Match device", icon: <Monitor size={18} aria-hidden="true" /> },
  { id: "light", label: "Light", icon: <Sun size={18} aria-hidden="true" /> },
  { id: "dark", label: "Dark", icon: <Moon size={18} aria-hidden="true" /> },
];

const ACCESS_MODES: Array<{ id: FormAccess["mode"]; name: string; description: string }> = [
  { id: "anyone", name: "Anyone with the link", description: "No sign-in needed." },
  { id: "aiesec", name: "People who sign in with AIESEC", description: "They sign in before answering." },
];

function AccessSettings({ access, onChange }: { access: FormAccess; onChange: (patch: Partial<FormAccess>) => void }) {
  return (
    <Section title="Who can respond" description="Published forms are open to anyone with the link unless you limit them here.">
      <fieldset className="ae-fieldset">
        <legend className="sr-only">Who can respond</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ACCESS_MODES.map((mode) => (
            <label
              key={mode.id}
              className={cx(
                "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors duration-150",
                access.mode === mode.id ? "border-primary bg-primary-soft" : "border-border hover:border-border-strong",
              )}
            >
              <input type="radio" name="access" value={mode.id} checked={access.mode === mode.id} onChange={() => onChange({ mode: mode.id })} className="ae-radio mt-0.5" />
              <span className="flex min-w-0 flex-col">
                <span className="ae-body-sm font-bold text-text">{mode.name}</span>
                <span className="ae-caption text-text-muted">{mode.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {access.mode === "aiesec" && (
        <div className="flex flex-col gap-4">
          <Switch label="Only current AIESEC members" hint="People need a current role in EXPA." checked={access.membersOnly} onChange={(event) => onChange({ membersOnly: event.target.checked })} />
          <Switch
            label="Record who responded"
            hint="Adds their name, email and AIESEC ID to each response. They see this before sending."
            checked={access.recordRespondent}
            onChange={(event) => onChange({ recordRespondent: event.target.checked })}
          />
          <Switch label="One response per person" hint="People who already responded see a message instead of the form." checked={access.onePerPerson} onChange={(event) => onChange({ onePerPerson: event.target.checked })} />
          <p className="ae-caption text-text-muted">Embedded copies ask people to open the form in a new tab to sign in. Changes apply when you publish.</p>
        </div>
      )}
    </Section>
  );
}

export function SettingsPanel({ doc, onSettings, onTheme, children }: Props) {
  const { settings, theme } = doc;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6 lg:py-10">
      {children}

      <AccessSettings access={settings.access} onChange={(patch) => onSettings({ access: { ...settings.access, ...patch } })} />

      <Section title="After someone responds" description="What respondents see once their answers are sent.">
        <TextField label="Confirmation title" value={settings.confirmationTitle} maxLength={200} onChange={(event) => onSettings({ confirmationTitle: event.target.value })} />
        <Textarea
          label="Confirmation message"
          rows={3}
          value={settings.confirmationMessage}
          maxLength={2000}
          placeholder="We'll be in touch within a week."
          onChange={(event) => onSettings({ confirmationMessage: event.target.value })}
        />
        <RedirectSetting value={settings.redirectUrl} onChange={(redirectUrl) => onSettings({ redirectUrl })} />
        <Switch
          label="Let people submit another response"
          hint={settings.access.mode === "aiesec" && settings.access.onePerPerson ? "Off while “One response per person” is on." : undefined}
          disabled={settings.access.mode === "aiesec" && settings.access.onePerPerson}
          checked={settings.allowAnotherResponse && !(settings.access.mode === "aiesec" && settings.access.onePerPerson)}
          onChange={(event) => onSettings({ allowAnotherResponse: event.target.checked })}
        />
      </Section>

      <Section title="Form behaviour">
        <TextField
          label="Submit button text"
          hint="Say what happens, like “Send application”."
          value={settings.submitLabel}
          maxLength={40}
          onChange={(event) => onSettings({ submitLabel: event.target.value })}
          onBlur={(event) => {
            if (!event.target.value.trim()) onSettings({ submitLabel: "Send response" });
          }}
        />
        <Switch label="Show a progress bar" hint="Only appears on forms with more than one page." checked={settings.showProgressBar} onChange={(event) => onSettings({ showProgressBar: event.target.checked })} />
        <Switch label="Number the questions" hint="Shows 1, 2, 3… before each question. Text blocks aren't numbered." checked={settings.numberQuestions} onChange={(event) => onSettings({ numberQuestions: event.target.checked })} />
      </Section>

      <Section title="Look" description="The accent colours the form's buttons, choices and top bar.">
        <fieldset className="ae-fieldset">
          <legend className="ae-fieldset__legend ae-label">Style</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FORM_STYLES.map((id) => (
              <label
                key={id}
                className={cx(
                  "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors duration-150",
                  theme.style === id ? "border-primary bg-primary-soft" : "border-border hover:border-border-strong",
                )}
              >
                <input type="radio" name="style" value={id} checked={theme.style === id} onChange={() => onTheme({ style: id })} className="ae-radio" />
                {/* A swatch drawn in the style itself: page colour, card corners and shadow, heading font. */}
                <span aria-hidden="true" data-theme={id === "calm" ? "light" : `${id}-light`} className="flex h-12 w-16 shrink-0 rounded-md border border-border bg-bg p-1.5">
                  <span className="flex flex-1 flex-col justify-between rounded-lg border border-border bg-surface px-2 py-1.5 shadow-card">
                    <span className="font-[family-name:var(--font-display)] text-xs leading-none font-bold text-text">Aa</span>
                    <span className="h-1.5 w-7 rounded-full bg-primary" />
                  </span>
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="ae-body-sm font-bold text-text">{STYLES[id].name}</span>
                  <span className="ae-caption text-text-muted">{STYLES[id].description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="ae-fieldset">
          <legend className="ae-fieldset__legend ae-label">Accent colour</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PROGRAM_IDS.map((id) => (
              <label
                key={id}
                data-program={id}
                className={cx(
                  "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors duration-150",
                  theme.accent === id ? "border-primary bg-primary-soft" : "border-border hover:border-border-strong",
                )}
              >
                <input type="radio" name="accent" value={id} checked={theme.accent === id} onChange={() => onTheme({ accent: id })} className="ae-radio" />
                <span aria-hidden="true" className="inline-block size-5 rounded-full bg-accent" />
                <span className="ae-body-sm text-text">{PROGRAMS[id]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="ae-fieldset">
          <legend className="ae-fieldset__legend ae-label">Colour scheme</legend>
          <div className="flex flex-wrap gap-2">
            {MODES.map((mode) => (
              <label
                key={mode.id}
                className={cx(
                  "relative flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition-colors duration-150",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                  theme.mode === mode.id ? "border-primary bg-primary-soft text-primary-text" : "border-border text-text hover:border-border-strong",
                )}
              >
                <input type="radio" name="mode" value={mode.id} checked={theme.mode === mode.id} onChange={() => onTheme({ mode: mode.id })} className="sr-only" />
                {mode.icon}
                <span className="ae-body-sm">{mode.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </Section>
    </div>
  );
}
