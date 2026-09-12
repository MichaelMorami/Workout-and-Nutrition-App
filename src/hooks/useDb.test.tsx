/**
 * `useDb` is the only way a screen reads the migrated database connection. Outside a `DbProvider`
 * it throws rather than silently returning `undefined` — a screen that queries before migration
 * is a startup bug, not a state to render around.
 */
import { render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import type { VitalsDb } from '../db';
import { DbProvider } from '../components/db/DbProvider';
import { useDb } from './useDb';

const fakeDb = { __fake: 'db' } as unknown as VitalsDb;

function Consumer(): React.JSX.Element {
  const db = useDb();
  return <Text>{db === fakeDb ? 'same-db' : 'different-db'}</Text>;
}

describe('useDb', () => {
  it('throws when used outside a DbProvider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Consumer />)).rejects.toThrow(/DbProvider/);
    spy.mockRestore();
  });

  it('returns the connection provided by DbProvider', async () => {
    const view = await render(
      <DbProvider db={fakeDb}>
        <Consumer />
      </DbProvider>,
    );
    expect(view.getByText('same-db')).toBeTruthy();
  });
});
