export const dynamic = 'force-dynamic';

import { Suspense } from 'react';

import { LabFrame } from '@/components/lab/LabFrame';
import { LabMemo } from '@/components/lab/LabMemo';

export default function MemoPage() {
  return (
    <Suspense fallback={<LabFrame active="memo">{null}</LabFrame>}>
      <LabMemo />
    </Suspense>
  );
}
