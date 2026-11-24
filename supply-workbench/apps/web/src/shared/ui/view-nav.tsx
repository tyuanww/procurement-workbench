import type { CSSProperties } from 'react';
import { NavLink, useMatch } from 'react-router';
import { brand, radius, rowComfort, space } from '../../theme/tokens.js';

type View = { readonly to: string; readonly label: string };

export function ViewNav({ label, views }: { readonly label: string; readonly views: readonly View[] }) {
  return (
    <nav aria-label={label} style={{ display: 'flex', gap: space[1], marginBlockEnd: space[3] }}>
      {views.map((view) => <ViewLink key={view.to} view={view} />)}
    </nav>
  );
}

function ViewLink({ view }: { readonly view: View }) {
  const isPage = useMatch(view.to) !== null;
  return <NavLink to={view.to} aria-current={isPage ? 'page' : 'location'} style={viewLinkStyle}>{view.label}</NavLink>;
}

function viewLinkStyle({ isActive }: { readonly isActive: boolean }): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    minBlockSize: rowComfort,
    paddingInline: space[3],
    borderRadius: radius,
    color: brand[800],
    background: isActive ? brand[100] : 'transparent',
    fontWeight: isActive ? 600 : 400,
    textDecoration: isActive ? 'underline' : 'none',
    textUnderlineOffset: '0.2em',
  };
}
