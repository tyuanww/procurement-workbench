import { DatePicker, Input, type InputRef } from 'antd';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { createContext, useCallback, useContext, type ComponentProps, type Ref } from 'react';

dayjs.extend(customParseFormat);

type FormDateControl = Pick<ComponentProps<typeof DatePicker>,
  'id' | 'name' | 'aria-labelledby' | 'aria-required' | 'aria-invalid' | 'aria-describedby' | 'onBlur'>;

type DateDraft = { readonly value: string; readonly invalid: boolean; readonly onChange: (value: string) => void };
const DateDraftContext = createContext<DateDraft | null>(null);

function DateDraftInput({ ref, ...props }: Omit<ComponentProps<typeof Input>, 'ref'> & { readonly ref?: Ref<HTMLInputElement> }) {
  const draft = useContext(DateDraftContext);
  const inputRef = useCallback((input: InputRef | null) => {
    const element = input?.input ?? null;
    if (typeof ref === 'function') return ref(element);
    if (ref != null) ref.current = element;
  }, [ref]);
  // DatePicker commits parsed dates. The form also needs the exact text to validate invalid drafts.
  return <Input {...props} ref={inputRef} variant="borderless" style={{ ...props.style, padding: 0, minBlockSize: 0 }}
    value={draft?.value ?? props.value} aria-invalid={draft?.invalid === true || props['aria-invalid']}
    onChange={(event) => {
      props.onChange?.(event);
      draft?.onChange(event.currentTarget.value);
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
