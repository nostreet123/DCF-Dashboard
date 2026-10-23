/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ImportMemo } from '../components/lab/LabStates';

describe('ImportMemo', () => {
  test('disables repeat import while its review panel is open', () => {
    const markup = renderToStaticMarkup(
      <ImportMemo
        ticker="MSFT"
        name="Microsoft Corporation"
        onImport={() => undefined}
        reviewing
        review={<p>Review the imported figures.</p>}
      />,
    );

    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Import and review<\/button>/);
    expect(markup).toContain('Review the imported figures.');
  });
});
