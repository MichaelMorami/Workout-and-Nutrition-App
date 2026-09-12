import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { DbProvider } from '../src/components/db/DbProvider';
import { fontAssetMap } from '../src/components/theme/font-assets';
import { ThemeProvider } from '../src/components/theme/ThemeProvider';
import { migrateVitalsDb, openVitalsDb, type VitalsConnection } from '../src/db/client';
import { useTheme } from '../src/hooks/useTheme';
import { space, type } from '../src/theme/tokens';

/** A startup failure is rare and unrecoverable from inside the app (the database itself did not
 * come up) — an honest message beats a blank screen. */
function StartupError({ message }: { message: string }): React.JSX.Element {
  const { color } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: space[8],
        backgroundColor: color.bg.canvas,
      }}
    >
      <Text style={{ ...type.body, color: color.text.primary, textAlign: 'center' }}>
        {`Vitals couldn't start: ${message}`}
      </Text>
    </View>
  );
}

/**
 * The app shell: loads the Archivo `fontInstances` with `expo-font`, runs
 * `await migrateVitalsDb(openVitalsDb())` once, and renders `children` only once both are ready —
 * wrapped in `ThemeProvider` and `DbProvider` so every screen resolves a theme and a ready
 * connection. Exported separately from the default `RootLayout` so a test can exercise the gating
 * without expo-router's `Stack`.
 */
export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [fontsLoaded] = useFonts(fontAssetMap);
  const [connection, setConnection] = useState<VitalsConnection | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const opened = openVitalsDb();
    migrateVitalsDb(opened)
      .then(() => {
        if (!cancelled) setConnection(opened);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ThemeProvider>
      {error ? (
        <StartupError message={error.message} />
      ) : fontsLoaded && connection ? (
        <DbProvider db={connection.db}>{children}</DbProvider>
      ) : null}
    </ThemeProvider>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <AppShell>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </AppShell>
  );
}
