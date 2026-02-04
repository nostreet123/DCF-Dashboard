'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from 'react';

type Scenario = 'base' | 'bull' | 'bear';

interface Assumptions {
  revenueGrowth: number;
  operatingMargin: number;
  discountRate: number;
  terminalGrowth: number;
}

interface ValuationResult {
  fairValue: number;
  range: [number, number];
  histogram: {
    binCenters: number[];
    density: number[];
  };
  sensitivityMatrix: number[][];
}

interface WorkbenchState {
  // Selection
  selectedSymbol: string | null;
  selectedCompanyId: string | null;
  selectedRunId: string | null;

  // Scenario
  scenario: Scenario;

  // Assumptions (per scenario)
  assumptions: Record<Scenario, Assumptions>;

  // Results
  result: ValuationResult | null;
  isComputing: boolean;
  error: Error | null;
}

interface WorkbenchActions {
  setSelectedSymbol: (symbol: string | null) => void;
  setSelectedCompanyId: (id: string | null) => void;
  setSelectedRunId: (id: string | null) => void;
  setScenario: (scenario: Scenario) => void;
  updateAssumption: (key: keyof Assumptions, value: number) => void;
  setResult: (result: ValuationResult | null) => void;
  setIsComputing: (isComputing: boolean) => void;
  setError: (error: Error | null) => void;
  resetWorkbench: () => void;
}

type WorkbenchContextValue = WorkbenchState & WorkbenchActions;

const defaultAssumptions: Record<Scenario, Assumptions> = {
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

const initialState: WorkbenchState = {
  selectedSymbol: null,
  selectedCompanyId: null,
  selectedRunId: null,
  scenario: 'base',
  assumptions: defaultAssumptions,
  result: null,
  isComputing: false,
  error: null,
};

const WorkbenchContext = createContext<WorkbenchContextValue | undefined>(
  undefined
);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkbenchState>(initialState);

  const setSelectedSymbol = useCallback((symbol: string | null) => {
    setState((prev) => ({ ...prev, selectedSymbol: symbol }));
  }, []);

  const setSelectedCompanyId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, selectedCompanyId: id }));
  }, []);

  const setSelectedRunId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, selectedRunId: id }));
  }, []);

  const setScenario = useCallback((scenario: Scenario) => {
    setState((prev) => ({ ...prev, scenario }));
  }, []);

  const updateAssumption = useCallback(
    (key: keyof Assumptions, value: number) => {
      setState((prev) => ({
        ...prev,
        assumptions: {
          ...prev.assumptions,
          [prev.scenario]: {
            ...prev.assumptions[prev.scenario],
            [key]: value,
          },
        },
      }));
    },
    []
  );

  const setResult = useCallback((result: ValuationResult | null) => {
    setState((prev) => ({ ...prev, result }));
  }, []);

  const setIsComputing = useCallback((isComputing: boolean) => {
    setState((prev) => ({ ...prev, isComputing }));
  }, []);

  const setError = useCallback((error: Error | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const resetWorkbench = useCallback(() => {
    setState(initialState);
  }, []);

  const value = useMemo<WorkbenchContextValue>(
    () => ({
      ...state,
      setSelectedSymbol,
      setSelectedCompanyId,
      setSelectedRunId,
      setScenario,
      updateAssumption,
      setResult,
      setIsComputing,
      setError,
      resetWorkbench,
    }),
    [
      state,
      setSelectedSymbol,
      setSelectedCompanyId,
      setSelectedRunId,
      setScenario,
      updateAssumption,
      setResult,
      setIsComputing,
      setError,
      resetWorkbench,
    ]
  );

  return (
    <WorkbenchContext.Provider value={value}>
      {children}
    </WorkbenchContext.Provider>
  );
}

export function useWorkbench() {
  const context = useContext(WorkbenchContext);
  if (!context) {
    throw new Error('useWorkbench must be used within WorkbenchProvider');
  }
  return context;
}

/**
 * Get the current scenario's assumptions.
 */
export function useCurrentAssumptions() {
  const { scenario, assumptions } = useWorkbench();
  return assumptions[scenario];
}
