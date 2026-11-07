'use client';
import * as React from 'react';
import { TextField, type TextFieldProps } from './TextField';

export type DatePickerProps = Omit<TextFieldProps, 'type' | 'iconStart'>;

/** A labelled native date input: localised calendar, keyboard and screen-reader support from the browser. Value is `YYYY-MM-DD`. */
export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(props, ref) {
  return <TextField ref={ref} type="date" {...props} />;
});
