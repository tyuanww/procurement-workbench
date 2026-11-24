import type { CSSProperties } from 'react';
import { NavLink, useMatch } from 'react-router';
import { brand, radius, rowComfort, space } from '../../theme/tokens.js';

export function ManagementViewNav() {
  const isReportList = useMatch('/reports') !== null;
  return (
    <nav aria-label="管理视图" style={{ display: 'flex', gap: space[1], marginBlockEnd: space[3] }}>
      <NavLink to="/dashboard" style={viewLinkStyle}>看板</NavLink>
      <NavLink to="/reports" aria-current={isReportList ? 'page' : 'location'} style={viewLinkStyle}>周报</NavLink>
    </nav>
  );
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
