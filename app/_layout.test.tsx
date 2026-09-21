/**
 * `app/_layout.tsx` is the app shell: it loads the Archivo fonts with `expo-font`, runs
 * `await migrateVitalsDb(openVitalsDb())` once, and only then renders its children — wrapped in
 * `ThemeProvider` and `DbProvider` so every screen gets a theme and a ready connection.
 *
 * `AppShell` (a named export alongside the default `RootLayout`) is the piece under test here: it
 * holds the gating logic without expo-router's `Stack`, so this test needs no router harness.
 */
import { act, render, screen } from '@testing-library/react-native';
import { useFonts } from 'expo-font';
import React from 'react';
import { Text } from 'react-native';
import { migrateVitalsDb, openVitalsDb } from '../src/db/client';
import { AppShell } from './_layout';

jest.mock('expo-font');
jest.mock('../src/db/client');
// The real font-assets module `require()`s `assets/fonts/*.ttf`, which don't exist yet (blocked —
// see the comment on that file). Mocking it here means this test never touches those paths.
jest.mock('../src/components/theme/font-assets', () => ({ fontAssetMap: {} }));
// `initialWindowMetrics` is populated by a synchronous native call at real app startup — under
// jest there is no native side to call, so it resolves to `null`, and `SafeAreaProvider` without a
// usable `initialMetrics` waits forever for an `onInsetsChange` event this environment never fires
// (every render then shows nothing, `AppShell`'s own gating notwithstanding). This overrides only
// that one constant with a fixed frame; `SafeAreaProvider` and `useSafeAreaInsets` stay the real
// implementation, per the design spec's own instruction not to mock the module wholesale.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<typeof import('react-native-safe-area-context')>('react-native-safe-area-context'),
  initialWindowMetrics: { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } },
}));

const mockUseFonts = jest.mocked(useFonts);
const mockOpenVitalsDb = jest.mocked(openVitalsDb);
const mockMigrateVitalsDb = jest.mocked(migrateVitalsDb);

const fakeConnection = { db: { __fake: 'db' }, sqlite: { __fake: 'sqlite' } } as never;

/** Resolves/rejects on demand, so a test can assert the pre-migration state before settling it. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (err: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AppShell', () => {
  beforeEach(() => {
    mockOpenVitalsDb.mockReturnValue(fakeConnection);
  });

  it('renders nothing while fonts have not loaded and migration has not resolved', async () => {
    mockUseFonts.mockReturnValue([false, null]);
    mockMigrateVitalsDb.mockReturnValue(new Promise(() => {}));

    await render(
      <AppShell>
        <Text>ready</Text>
      </AppShell>,
    );

    expect(screen.queryByText('ready')).toBeNull();
  });

  it('renders nothing once fonts have loaded but migration has not resolved yet', async () => {
    mockUseFonts.mockReturnValue([true, null]);
    const migration = deferred<void>();
    mockMigrateVitalsDb.mockReturnValue(migration.promise);

    await render(
      <AppShell>
        <Text>ready</Text>
      </AppShell>,
    );

    expect(screen.queryByText('ready')).toBeNull();
  });

  it('renders nothing once migration has resolved but fonts have not loaded', async () => {
    mockUseFonts.mockReturnValue([false, null]);
    mockMigrateVitalsDb.mockResolvedValue(undefined);

    await render(
      <AppShell>
        <Text>ready</Text>
      </AppShell>,
    );

    expect(screen.queryByText('ready')).toBeNull();
  });

  it('renders its children only once both fonts and migration are ready', async () => {
    mockUseFonts.mockReturnValue([true, null]);
    const migration = deferred<void>();
    mockMigrateVitalsDb.mockReturnValue(migration.promise);

    await render(
      <AppShell>
        <Text>ready</Text>
      </AppShell>,
    );
    expect(screen.queryByText('ready')).toBeNull();

    await act(async () => {
      migration.resolve(undefined);
      await migration.promise;
    });

    expect(screen.getByText('ready')).toBeTruthy();
  });
});
