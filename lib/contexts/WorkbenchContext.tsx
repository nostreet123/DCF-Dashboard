'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

export type Scenario = 'base' | 'bull' | 'bear';

export interface Assumptions {
  revenueGrowth: number;
  operatingMargin: number;
  discountRate: number;
  terminalGrowth: number;
}

export interface ValuationResult {
  fairValue: number;
  range: [number, number];
  histogram: {
    binCenters: number[];
    density: number[];
  };
  sensitivityMatrix: number[][];
}

export interface WorkbenchState {
  selectedSymbol: string | null;
  selectedCompanyId: string | null;
  selectedRunId: string | null;
  scenario: Scenario;
  assumptions: Record<Scenario, Assumptions>;
  result: ValuationResult | null;
  isComputing: boolean;
  error: Error | null;
}

const baseAssumptions: Record<Scenario, Assumptions> = {
  base: {
    revenueGrowth: 12,
    operatingMargin: 25,
    discountRate: 10,
    terminalGrowth: 2.5,
  },
  bull: {
    revenueGrowth: 18,
    operatingMargin: 30,
    discountRate: 8,
    terminalGrowth: 3,
  },
  bear: {
    revenueGrowth: 6,
    operatingMargin: 18,
    discountRate: 14,
    terminalGrowth: 2,
  },
};

function cloneAssumptions() {
  return {
    base: { ...baseAssumptions.base },
    bull: { ...baseAssumptions.bull },
    bear: { ...baseAssumptions.bear },
  };
}

export function createInitialWorkbenchState(): WorkbenchState {
  return {
    selectedSymbol: null,
    selectedCompanyId: null,
    selectedRunId: null,
    scenario: 'base',
    assumptions: cloneAssumptions(),
    result: null,
    isComputing: false,
    error: null,
  };
}

export type WorkbenchAction =
  | { type: 'set_selected_symbol'; symbol: string | null }
  | { type: 'set_selected_company_id'; id: string | null }
  | { type: 'set_selected_run_id'; id: string | null }
  | { type: 'select_company'; id: string | null; symbol: string | null }
  | { type: 'set_scenario'; scenario: Scenario }
  | { type: 'update_assumption'; key: keyof Assumptions; value: number }
  | { type: 'set_result'; result: ValuationResult | null }
  | { type: 'set_is_computing'; isComputing: boolean }
  | { type: 'set_error'; error: Error | null }
  | { type: 'reset' };

export function workbenchReducer(
  state: WorkbenchState,
  action: WorkbenchAction,
): WorkbenchState {
  switch (action.type) {
    case 'set_selected_symbol':
      return { ...state, selectedSymbol: action.symbol };
    case 'set_selected_company_id':
      return { ...state, selectedCompanyId: action.id };
    case 'set_selected_run_id':
      return { ...state, selectedRunId: action.id };
    case 'select_company':
      return {
        ...state,
        selectedCompanyId: action.id,
        selectedSymbol: action.symbol,
        selectedRunId: null,
      };
    case 'set_scenario':
      return { ...state, scenario: action.scenario };
    case 'update_assumption':
      return {
        ...state,
        assumptions: {
          ...state.assumptions,
          [state.scenario]: {
            ...state.assumptions[state.scenario],
            [action.key]: action.value,
          },
        },
      };
    case 'set_result':
      return { ...state, result: action.result };
    case 'set_is_computing':
      return { ...state, isComputing: action.isComputing };
    case 'set_error':
      return { ...state, error: action.error };
    case 'reset':
      return createInitialWorkbenchState();
    default:
      return state;
  }
}

interface WorkbenchActions {
  setSelectedSymbol: (symbol: string | null) => void;
  setSelectedCompanyId: (id: string | null) => void;
  setSelectedRunId: (id: string | null) => void;
  selectCompany: (id: string | null, symbol: string | null) => void;
  setScenario: (scenario: Scenario) => void;
  updateAssumption: (key: keyof Assumptions, value: number) => void;
  setResult: (result: ValuationResult | null) => void;
  setIsComputing: (isComputing: boolean) => void;
  setError: (error: Error | null) => void;
  resetWorkbench: () => void;
}

type WorkbenchContextValue = WorkbenchState & WorkbenchActions;

const WorkbenchContext = createContext<WorkbenchContextValue | undefined>(undefined);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workbenchReducer, undefined, createInitialWorkbenchState);

  const setSelectedSymbol = useCallback((symbol: string | null) => {
    dispatch({ type: 'set_selected_symbol', symbol });
  }, []);

  const setSelectedCompanyId = useCallback((id: string | null) => {
    dispatch({ type: 'set_selected_company_id', id });
  }, []);

  const setSelectedRunId = useCallback((id: string | null) => {
    dispatch({ type: 'set_selected_run_id', id });
  }, []);

  const selectCompany = useCallback((id: string | null, symbol: string | null) => {
    dispatch({ type: 'select_company', id, symbol });
  }, []);

  const setScenario = useCallback((scenario: Scenario) => {
    dispatch({ type: 'set_scenario', scenario });
  }, []);

  const updateAssumption = useCallback((key: keyof Assumptions, value: number) => {
    dispatch({ type: 'update_assumption', key, value });
  }, []);

  const setResult = useCallback((result: ValuationResult | null) => {
    dispatch({ type: 'set_result', result });
  }, []);

  const setIsComputing = useCallback((isComputing: boolean) => {
    dispatch({ type: 'set_is_computing', isComputing });
  }, []);

  const setError = useCallback((error: Error | null) => {
    dispatch({ type: 'set_error', error });
  }, []);

  const resetWorkbench = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  const value = useMemo<WorkbenchContextValue>(
    () => ({
      ...state,
      setSelectedSymbol,
      setSelectedCompanyId,
      setSelectedRunId,
      selectCompany,
      setScenario,
      updateAssumption,
      setResult,
      setIsComputing,
      setError,
      resetWorkbench,
    }),
    [
      resetWorkbench,
      selectCompany,
      setError,
      setIsComputing,
      setResult,
      setScenario,
      setSelectedCompanyId,
      setSelectedRunId,
      setSelectedSymbol,
      state,
      updateAssumption,
    ],
  );

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench() {
  const context = useContext(WorkbenchContext);
  if (!context) {
    throw new Error('useWorkbench must be used within WorkbenchProvider');
  }
  return context;
}

export function useCurrentAssumptions() {
  const { scenario, assumptions } = useWorkbench();
  return assumptions[scenario];
}
