'use client';

import { useState } from 'react';
import { Sparkline } from '@/components/charts/Sparkline';
import { DistributionCurve } from '@/components/charts/DistributionCurve';
import { SensitivityHeatmap } from '@/components/charts/SensitivityHeatmap';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const mockSparklineData = [100, 105, 102, 110, 108, 115, 112, 120, 118, 125];

const mockHistogram = {
  binCenters: [100, 110, 120, 130, 140, 150, 160, 170, 180, 190],
  density: [0.02, 0.05, 0.12, 0.22, 0.28, 0.18, 0.08, 0.03, 0.015, 0.005],
};

const mockHeatmapData = [
  [95, 105, 115, 125, 135],
  [105, 118, 130, 142, 155],
  [115, 130, 145, 160, 175],
  [125, 142, 160, 178, 195],
  [135, 155, 175, 195, 215],
];

export default function ChartsTestPage() {
  const [currentValue, setCurrentValue] = useState(145);

  return (
    <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', color: 'var(--text-primary)' }}>
          Chart Components Test
        </h1>
        <ThemeToggle />
      </div>

      {/* Sparkline */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--text-primary)', marginBottom: '16px' }}>
          Sparkline
        </h2>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>Default</p>
            <Sparkline data={mockSparklineData} width={100} height={32} />
          </div>
          <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>With Glow</p>
            <Sparkline data={mockSparklineData} width={100} height={32} showGlow />
          </div>
          <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>Gold Color</p>
            <Sparkline data={mockSparklineData} width={100} height={32} color="var(--accent-gold)" />
          </div>
          <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>Wide</p>
            <Sparkline data={mockSparklineData} width={200} height={40} strokeWidth={2} />
          </div>
        </div>
      </section>

      {/* Distribution Curve */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--text-primary)', marginBottom: '16px' }}>
          Distribution Curve
        </h2>
        <div style={{ padding: '24px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              Current Value: ${currentValue}
            </label>
            <input
              type="range"
              min={100}
              max={190}
              value={currentValue}
              onChange={(e) => setCurrentValue(Number(e.target.value))}
              style={{ width: '200px' }}
            />
          </div>
          <DistributionCurve
            histogram={mockHistogram}
            currentValue={currentValue}
            width={400}
            height={120}
          />
        </div>
      </section>

      {/* Sensitivity Heatmap */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--text-primary)', marginBottom: '16px' }}>
          Sensitivity Heatmap
        </h2>
        <div style={{ padding: '24px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <SensitivityHeatmap
            data={mockHeatmapData}
            growthOffsets={[-2, -1, 0, 1, 2]}
            waccOffsets={[-2, -1, 0, 1, 2]}
          />
        </div>
      </section>

      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
        Toggle theme to test dark/light mode rendering
      </p>
    </div>
  );
}
