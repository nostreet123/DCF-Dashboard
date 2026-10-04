export const dynamic = 'force-dynamic';

import { Suspense } from 'react';

import { LabFrame } from '@/components/lab/LabFrame';
import { LabMemo } from '@/components/lab/LabMemo';
import { ComputingMemo } from '@/components/lab/LabStates';

export default function MemoPage() {
  return (
    <Suspense
      fallback={
        <LabFrame active="memo" tone="status">
          <ComputingMemo companyLabel="AAPL · Apple Inc." shortName="Apple" />
        </LabFrame>
      }
    >
      <LabMemo />
    </Suspense>
  );
}
