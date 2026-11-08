"use client";

import { parseDate, type CalendarDate } from "@internationalized/date";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  FieldError,
  Group,
  Heading,
  Label,
  Popover,
  Text,
} from "react-aria-components";

import { ThemePortal, useThemeScope } from "@/components/aiesec/hooks";
import type { FieldOf } from "@/lib/forms/schema";

import { linkify } from "./linkify";

// The design system's DatePicker (type the date in the reader's locale or pick
// it from a calendar), laid out like every other question. Answers stay
// YYYY-MM-DD strings. Loaded on demand with React Aria.

type Props = {
  field: FieldOf<"date">;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  id: string;
};

/** A CalendarDate for a YYYY-MM-DD string; null for empty or malformed values (e.g. an old draft). */
function toDate(iso: string | null | undefined): CalendarDate | null {
  if (!iso) return null;
  try {
    return parseDate(iso);
  } catch {
    return null;
  }
}

export function DateQuestion({ field, value, error, onChange, id }: Props) {
  const [ref, scope] = useThemeScope<HTMLDivElement>();

  return (
    <DatePicker
      ref={ref}
      id={id}
      className="ae-field flex flex-col gap-3"
      value={toDate(value)}
      onChange={(date) => onChange(date ? date.toString() : "")}
      minValue={toDate(field.min) ?? undefined}
      maxValue={toDate(field.max) ?? undefined}
      isInvalid={Boolean(error)}
      isRequired={field.required}
      validationBehavior="aria"
    >
      <div className="flex flex-col gap-1">
        <Label className="ae-body-lg font-bold text-text">
          {field.label || "Untitled question"}
          {!field.required && <span className="font-normal text-text-muted"> (optional)</span>}
        </Label>
        {field.description && (
          <Text slot="description" className="block whitespace-pre-line ae-body-sm text-text-muted">
            {linkify(field.description)}
          </Text>
        )}
      </div>
      <Group className="ae-input ae-input--lg ae-date max-w-xs">
        <DateInput className="ae-date__input ae-body">{(segment) => <DateSegment segment={segment} className="ae-date__segment" />}</DateInput>
        <Button className="ae-input__action" aria-label="Open calendar">
          <CalendarIcon size={20} aria-hidden="true" />
        </Button>
      </Group>
      <FieldError className="ae-field__error ae-body-sm">
        <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          <span className="sr-only">Error: </span>
          {error}
        </span>
      </FieldError>
      <ThemePortal scope={scope}>
        <Popover className="ae-popover" offset={6}>
          <Dialog className="ae-calendar-dialog">
            <Calendar className="ae-calendar">
              <header className="ae-calendar__header">
                <Button slot="previous" className="ae-calendar__nav">
                  <ChevronLeft size={20} aria-hidden="true" className="ae-icon--flip" />
                </Button>
                <Heading className="ae-calendar__title ae-label" />
                <Button slot="next" className="ae-calendar__nav">
                  <ChevronRight size={20} aria-hidden="true" className="ae-icon--flip" />
                </Button>
              </header>
              <CalendarGrid className="ae-calendar__grid">
                <CalendarGridHeader>{(day) => <CalendarHeaderCell className="ae-calendar__weekday ae-caption">{day}</CalendarHeaderCell>}</CalendarGridHeader>
                <CalendarGridBody>{(date) => <CalendarCell date={date} className="ae-calendar__cell ae-body-sm" />}</CalendarGridBody>
              </CalendarGrid>
            </Calendar>
          </Dialog>
        </Popover>
      </ThemePortal>
    </DatePicker>
  );
}
