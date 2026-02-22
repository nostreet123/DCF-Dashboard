'use client';

import { useCallback, useMemo, useReducer } from 'react';

export type ViewMode = 'workbench' | 'investor';
export type DrawerState = 'library' | 'assumptions' | null;
export type RailVariant = 'docked' | 'drawer';

export interface DatasetItem {
  id: string;
  name: string;
  ticker: string;
}

export type DatasetGroups = Record<string, DatasetItem[]>;

export interface WorkbenchViewState {
  viewMode: ViewMode;
  activeDrawer: DrawerState;
}

export type WorkbenchViewAction =
  | { type: 'set_view_mode'; mode: ViewMode }
  | { type: 'open_library_drawer' }
  | { type: 'open_assumptions_drawer' }
  | { type: 'close_drawers' }
  | { type: 'select_company'; source: RailVariant }
  | { type: 'select_run'; source: RailVariant };

export const initialWorkbenchViewState: WorkbenchViewState = {
  viewMode: 'workbench',
  activeDrawer: null,
};

export function workbenchViewReducer(
  state: WorkbenchViewState,
  action: WorkbenchViewAction,
): WorkbenchViewState {
  switch (action.type) {
    case 'set_view_mode':
      return { ...state, viewMode: action.mode };
    case 'open_library_drawer':
      return { ...state, activeDrawer: 'library' };
    case 'open_assumptions_drawer':
      return { ...state, activeDrawer: 'assumptions' };
    case 'close_drawers':
      return { ...state, activeDrawer: null };
    case 'select_company':
      if (action.source === 'drawer') {
        return { ...state, activeDrawer: null };
      }
      return state;
    case 'select_run':
      if (action.source === 'drawer') {
        return { ...state, activeDrawer: null };
      }
      return state;
    default:
      return state;
  }
}

export function resolveActiveCompany(
  datasets: DatasetGroups,
  selectedCompanyId: string | null,
): DatasetItem | null {
  const ordered = Object.values(datasets).flat();
  if (ordered.length == 0) {
    return null;
  }

  if (!selectedCompanyId) {
    return ordered[0];
  }

  return ordered.find((item) => item.id === selectedCompanyId) ?? ordered[0];
}

export function useWorkbenchViewState() {
  const [state, dispatch] = useReducer(workbenchViewReducer, initialWorkbenchViewState);

  const setViewMode = useCallback((mode: ViewMode) => {
    dispatch({ type: 'set_view_mode', mode });
  }, []);

  const openLibraryDrawer = useCallback(() => {
    dispatch({ type: 'open_library_drawer' });
  }, []);

  const openAssumptionsDrawer = useCallback(() => {
    dispatch({ type: 'open_assumptions_drawer' });
  }, []);

  const closeDrawers = useCallback(() => {
    dispatch({ type: 'close_drawers' });
  }, []);

  const onCompanySelected = useCallback((source: RailVariant) => {
    dispatch({ type: 'select_company', source });
  }, []);

  const onRunSelected = useCallback((source: RailVariant) => {
    dispatch({ type: 'select_run', source });
  }, []);

  return useMemo(
    () => ({
      ...state,
      closeDrawers,
      onCompanySelected,
      onRunSelected,
      openAssumptionsDrawer,
      openLibraryDrawer,
      setViewMode,
    }),
    [
      closeDrawers,
      onCompanySelected,
      onRunSelected,
      openAssumptionsDrawer,
      openLibraryDrawer,
      setViewMode,
      state,
    ],
  );
}
