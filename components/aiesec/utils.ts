import type { IconName } from './icons';

/** Joins class names, skipping falsy parts. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Status tones shared by Alert, Toast, Badge, Progress. */
export type StatusTone = 'info' | 'success' | 'warning' | 'danger';
export type Tone = StatusTone | 'neutral' | 'accent';

/** AIESEC programme ids for `data-program` theming (Blue Book portfolio). */
export type ProgramId = 'am' | 'gv' | 'gta' | 'gte' | 'h4tf' | 'ys';

/** Official programme names, exactly as the Blue Book writes them. */
export const PROGRAMS: Readonly<Record<ProgramId, string>> = {
  am: 'AIESEC Member',
  gv: 'Global Volunteer',
  gta: 'Global Talent',
  gte: 'Global Teacher',
  h4tf: 'Heading for the Future',
  ys: 'Youth Speak',
};

export const TONE_ICON: Readonly<Record<StatusTone, IconName>> = {
  info: 'info',
  success: 'circle-check',
  warning: 'triangle-alert',
  danger: 'circle-alert',
};

/** Spoken prefix for status icons, so tone never relies on colour alone. */
export const TONE_LABEL: Readonly<Record<StatusTone, string>> = {
  info: 'Information',
  success: 'Success',
  warning: 'Warning',
  danger: 'Error',
};
