import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { Alert, Form } from 'antd';
import { space } from '../../../theme/tokens.js';

const Validation = createContext<{ readonly attempts: number; readonly announce: (message: string) => void }>({ attempts: 0, announce: () => undefined });

export function RecordFormLayout(props: {
  readonly id: string;
  readonly invalid: boolean;
  readonly error?: string | undefined;
  readonly onSubmit: () => void;
  readonly children: ReactNode;
}) {
  const [attempts, setAttempts] = useState(0);
  const [announcement, announce] = useState('');
  useEffect(() => {
    if (attempts === 0) return;
    document.getElementById(props.id)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempts, props.id]);

  return (
    <Form id={props.id} className="record-form" layout="vertical" noValidate onFinish={() => {
      if (props.invalid) {
        announce('');
        setAttempts((previous) => previous + 1);
      } else props.onSubmit();
    }}>
      {props.error ? <Alert type="error" showIcon title={props.error} style={{ marginBottom: 16 }} /> : null}
      <Validation value={{ attempts, announce }}>{props.children}</Validation>
      <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>{announcement}</span>
      <style>{recordTouchCss}</style>
    </Form>
  );
}

type FieldControl = {
  readonly id: string;
  readonly 'aria-labelledby': string;
  readonly 'aria-required': boolean | undefined;
  readonly 'aria-invalid': boolean;
  readonly 'aria-describedby': string | undefined;
  readonly onBlur: () => void;
};

export function RecordField(props: {
  readonly label: string;
  readonly required?: boolean | undefined;
  readonly hint?: string;
  readonly error?: string | undefined;
  readonly children: (control: FieldControl) => ReactNode;
}) {
  const id = useId();
  const { attempts, announce } = useContext(Validation);
  const [isTouched, setTouched] = useState(false);
  const error = isTouched || attempts > 0 ? props.error : undefined;
  const descriptionIds = [props.hint === undefined ? '' : `${id}-hint`, error === undefined ? '' : `${id}-error`].filter(Boolean).join(' ');
  return (
    <Form.Item label={<span id={`${id}-label`}>{props.label}</span>} htmlFor={id} required={props.required ?? false} style={{ marginBottom: space[3] }}
      validateStatus={error === undefined ? '' : 'error'}
      help={error === undefined ? undefined : <span id={`${id}-error`}>{error}</span>}
      extra={props.hint === undefined ? undefined : <span id={`${id}-hint`}>{props.hint}</span>}>
      {props.children({
        id,
        'aria-labelledby': `${id}-label`,
        'aria-required': props.required,
        'aria-invalid': error !== undefined,
        'aria-describedby': descriptionIds || undefined,
        onBlur: () => {
          setTouched(true);
          announce(props.error ?? '');
        },
      })}
    </Form.Item>
  );
}

const recordTouchCss = `
  @media (max-width: 575px) {
    .record-form .ant-input, .record-form .ant-input-number, .record-form .ant-select, .record-form-footer .ant-btn { min-block-size: 44px; }
  }
`;
