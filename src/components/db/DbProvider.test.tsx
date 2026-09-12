/**
 * The migrated database connection reaches every screen through one provider, the same shape as
 * `ThemeProvider`. `app/_layout.tsx` is the only place that opens and migrates it; this provider
 * just hands the already-ready connection down.
 */
import { render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import type { VitalsDb } from '../../db';
import { useDb } from '../../hooks/useDb';
import { DbProvider } from './DbProvider';

const fakeDb = { __fake: 'db' } as unknown as VitalsDb;

function Consumer(): React.JSX.Element {
  const db = useDb();
  return <Text>{db === fakeDb ? 'same-db' : 'different-db'}</Text>;
}

describe('DbProvider', () => {
  it('renders its children', async () => {
    const view = await render(
      <DbProvider db={fakeDb}>
        <Text>hello</Text>
      </DbProvider>,
    );
    expect(view.getByText('hello')).toBeTruthy();
  });

  it('makes the exact connection it was given available via useDb', async () => {
    const view = await render(
      <DbProvider db={fakeDb}>
        <Consumer />
      </DbProvider>,
    );
    expect(view.getByText('same-db')).toBeTruthy();
  });
});
