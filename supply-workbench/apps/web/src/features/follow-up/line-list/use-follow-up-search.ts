import { useCallback, useMemo } from 'react';
import { createSearchParams, useLocation, useNavigate, type SetURLSearchParams } from 'react-router';
import { followUpAddress, followUpParams } from './follow-up-address.js';

export function useFollowUpSearch(): [URLSearchParams, SetURLSearchParams] {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => followUpParams(search, hash), [search, hash]);
  const update = useCallback<SetURLSearchParams>((next, options) => {
    const value = typeof next === 'function' ? next(params) : next;
    void navigate(followUpAddress(pathname, createSearchParams(value)), options);
  }, [navigate, params, pathname]);
  return [params, update];
}
