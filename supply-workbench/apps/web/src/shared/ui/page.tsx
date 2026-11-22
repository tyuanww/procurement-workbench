import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Typography } from 'antd';
import { bg, border, radiusCard, space, text } from '../../theme/tokens.js';

export function surfaceStyle(): {
  readonly background: string;
  readonly border: string;
  readonly borderRadius: 8;
  readonly boxShadow: 'none';
} {
  return {
    background: bg.surface,
    border: `1px solid ${border}`,
    borderRadius: radiusCard,
    boxShadow: 'none',
  };
}

export function pageHeaderRowStyle(): {
  readonly display: 'flex';
  readonly alignItems: 'center';
  readonly justifyContent: 'space-between';
  readonly lineHeight: '32px';
  readonly minHeight: 32;
  readonly marginBottom: 16;
} {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    lineHeight: '32px',
    minHeight: 32,
    marginBottom: space[3],
  };
}

export function PageHeader(input: {
  readonly title: string;
  readonly browserTitle?: string;
  readonly secondary?: string;
  readonly action?: ReactNode;
}): ReactNode {
  usePageTitle(input.browserTitle ?? input.title);
  return (
    <div style={pageHeaderRowStyle()}>
      <div style={titleClusterStyle()}>
        <Typography.Title level={1} style={titleTextStyle()}>
          {input.title}
        </Typography.Title>
        {secondaryNode(input.secondary)}
      </div>
      {input.action}
    </div>
  );
}

export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} | 采购工作台`;
  }, [title]);
}

export function WorkbenchPage(input: {
  readonly title: string;
  readonly browserTitle?: string;
  readonly secondary?: string;
  readonly action?: ReactNode;
  readonly maxWidth?: number;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section className="shell-page" style={shellPageStyle(input.maxWidth)}>
      <PageHeader title={input.title} {...(input.browserTitle === undefined ? {} : { browserTitle: input.browserTitle })} {...headerExtras(input)} />
      {input.children}
    </section>
  );
}

function shellPageStyle(maxWidth: number | undefined): CSSProperties {
  return maxWidth === undefined ? { margin: 0 } : { margin: 0, maxWidth };
}

function headerExtras(input: { readonly secondary?: string; readonly action?: ReactNode }): {
  readonly secondary?: string;
  readonly action?: ReactNode;
} {
  const secondary = input.secondary;
  return {
    ...(secondary === undefined || secondary === '' ? {} : { secondary }),
    ...(input.action === undefined ? {} : { action: input.action }),
  };
}

function secondaryNode(secondary: string | undefined): ReactNode {
  if (secondary === undefined || secondary === '') return null;
  return <Typography.Text type="secondary">{secondary}</Typography.Text>;
}

function titleClusterStyle(): CSSProperties {
  return { display: 'flex', alignItems: 'baseline', gap: space[1], minWidth: 0 };
}

function titleTextStyle(): CSSProperties {
  return { margin: 0, color: text.primary };
}
