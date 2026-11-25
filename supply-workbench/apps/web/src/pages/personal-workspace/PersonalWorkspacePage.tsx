import { Navigate, useLocation } from 'react-router';
import { businessToday } from '../../features/follow-up/index.js';
import { legacyPersonalPath } from '../../features/today/index.js';
import { WorkspacePreview } from './WorkspacePreview.js';

export function PersonalWorkspacePage() {
  const { search, hash, state } = useLocation();
  const params = new URLSearchParams(search);
  if (params.get('preview') === '1') return <WorkspacePreview />;
  return <Navigate replace to={legacyPersonalPath(search, businessToday()) + hash} state={state} />;
}
