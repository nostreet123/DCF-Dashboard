export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';

import { DashboardClient } from '../DashboardClient';

export const metadata: Metadata = {
  title: 'Workbench · DCF Lab',
  description: 'Assumption workbench for the DCF valuation engine.',
};

export default function WorkbenchPage() {
  return <DashboardClient />;
}
