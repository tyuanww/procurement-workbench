import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { createContext, useContext, type ComponentProps, type ComponentPropsWithRef } from 'react';

dayjs.extend(customParseFormat);

type FormDateControl = Pick<ComponentProps<typeof DatePicker>,
  'id' | 'name' | 'aria-labelledby' | 'aria-required' | 'aria-invalid' | 'aria-describedby' | 'onBlur'>;

type DateDraft = { readonly value: string; readonly invalid: boolean; readonly onChange: (value: string) => void };
const DateDraftContext = createContext<DateDraft | null>(null);

function DateDraftInput(props: ComponentPropsWithRef<'input'>) {
  const draft = useContext(DateDraftContext);
  if (draft === null) return <input {...props} />;
  // DatePicker commits parsed dates. The form also needs the exact text to validate invalid drafts.
  return <input {...props} value={draft.value} aria-invalid={draft.invalid || props['aria-invalid']}
    onChange={(event) => {
      props.onChange?.(event);
      draft.onChange(event.currentTarget.value);
    }} />;
}

const dateComponents = { input: DateDraftInput };

export function RecordDatePicker({ value, onChange, withTime = false, ...control }: FormDateControl & {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly withTime?: boolean;
}) {
  const format = withTime ? 'YYYY-MM-DD[T]HH:mm' : 'YYYY-MM-DD';
  const parsed = dayjs(value, format, true);
  return <DateDraftContext value={{ value, onChange, invalid: control['aria-invalid'] === true }}>
    <DatePicker {...control} value={parsed.isValid() ? parsed : null} format={format} components={dateComponents}
      placeholder={withTime ? 'YYYY-MM-DDTHH:mm' : 'YYYY-MM-DD'} showToday={false} preserveInvalidOnBlur
      showTime={withTime ? { format: 'HH:mm', showNow: false } : false}
      onChange={(date) => onChange(date === null ? '' : date.format(format))} />
  </DateDraftContext>;
}
