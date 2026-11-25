import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Flex, Typography } from 'antd';
import { bg, border, fontSize, radiusCard, space, text } from '../../theme/tokens.js';

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

const accessibleTitleStyle: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' };

export function PageHeader(input: {
  readonly title: string;
  readonly browserTitle?: string;
  readonly secondary?: string;
  readonly action?: ReactNode;
  readonly showIdentity?: boolean;
}): ReactNode {
  usePageTitle(input.browserTitle ?? input.title);
  const secondary = secondaryNode(input.secondary);
  const actions = input.action ?? null;
  const isIdentityVisible = input.showIdentity === true;
  return (
    <>
      {isIdentityVisible ? null : <Typography.Title level={1} style={accessibleTitleStyle}>{input.title}</Typography.Title>}
      {isIdentityVisible || secondary !== null || actions !== null ? (
        <Flex gap={space[2]} align="center" wrap style={{ marginBottom: space[2] }}>
          {isIdentityVisible ? <Typography.Title level={1} style={{ margin: 0, color: text.primary, fontSize: fontSize.body }}>{input.title}</Typography.Title> : null}
          {secondary}
          {actions === null ? null : <div style={{ marginInlineStart: 'auto' }}>{actions}</div>}
        </Flex>
      ) : null}
    </>
  );
}

export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} | SHINEMAGE 供应链工作台`;
  }, [title]);
}

export function WorkbenchPage(input: {
  readonly title: string;
  readonly browserTitle?: string;
  readonly secondary?: string;
  readonly action?: ReactNode;
  readonly showIdentity?: boolean;
  readonly maxWidth?: number;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section className="shell-page" style={shellPageStyle(input.maxWidth)}>
      <PageHeader title={input.title} showIdentity={input.showIdentity === true} {...(input.browserTitle === undefined ? {} : { browserTitle: input.browserTitle })} {...headerExtras(input)} />
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
