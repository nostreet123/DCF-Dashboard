export type Scenario = 'base' | 'bull' | 'bear';

export interface Assumptions {
  revenueGrowth: number;
  operatingMargin: number;
  discountRate: number;
  terminalGrowth: number;
}

export type ScenarioChipDirection = 'up' | 'down' | 'neutral';

export interface ScenarioChip {
  label: string;
  value: string;
  direction: ScenarioChipDirection;
}

export const scenarioAssumptionDefaults: Record<Scenario, Assumptions> = {
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

export const scenarioChipPresets: Record<Scenario, ScenarioChip[]> = {
  base: [
    { label: 'Growth', value: '12%', direction: 'neutral' },
    { label: 'Margin', value: '25%', direction: 'neutral' },
    { label: 'WACC', value: '10%', direction: 'neutral' },
  ],
  bull: [
    { label: 'Growth', value: '18%', direction: 'up' },
    { label: 'Margin', value: '30%', direction: 'up' },
    { label: 'WACC', value: '8%', direction: 'down' },
  ],
  bear: [
    { label: 'Growth', value: '6%', direction: 'down' },
    { label: 'Margin', value: '18%', direction: 'down' },
    { label: 'WACC', value: '14%', direction: 'up' },
  ],
};

export const defaultScenario: Scenario = 'base';

export const defaultAssumptions: Assumptions = scenarioAssumptionDefaults[defaultScenario];

export function cloneScenarioAssumptions(): Record<Scenario, Assumptions> {
  return {
    base: { ...scenarioAssumptionDefaults.base },
    bull: { ...scenarioAssumptionDefaults.bull },
    bear: { ...scenarioAssumptionDefaults.bear },
  };
}
