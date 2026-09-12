/**
 * `<TodayHeader>` — the Today screen's date header and the two calorie/protein rings (issue #41).
 *
 * PRESENTATIONAL, NOT SELF-FETCHING. Unlike `<QuickAddGrid>`/`<WeightChip>`, every number here
 * arrives as a prop. `app/(tabs)/index.tsx` owns the one `todayTotals` read and keeps a running
 * total in state, adding each `QuickAddGrid.onLogged` receipt's kcal/protein to it — the whole
 * reason that prop exists (see its doc comment) is so a tap updates these rings immediately,
 * without a second database read. A component that queried on its own here could not see that
 * optimistic write.
 *
 * ISDEFAULT: THE HONEST RING, PLUS A WAY OUT. `getSettings().isDefault` means no one has entered a
 * target yet — `kcalTarget`/`proteinTarget` are still the placeholder numbers from `DEFAULT_SETTINGS`,
 * not a choice the user made. Showing progress against a number they never set would misrepresent it,
 * so the target passed to `<ProgressArc>` is `0` in that case: the same honest, un-filled "No target
 * set" ring any zero target draws (`arc-math.ts`). Next to the date, the same "Set" word the day-one
 * canvas uses for an unset target (`design/build-canvas.mjs`'s settings row) becomes a real, one-tap
 * affordance — Settings is a real tab, so unlike the Sprint-3 workout chip this is not a placeholder
 * that looks tappable and does nothing.
 */
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { ProgressArc } from '../charts';
import { layout, radius, size, space, type, type Theme, type TypeStyle } from '../../theme/tokens';
import { formatTodayDate } from './date-header';

export type TodayHeaderProps = {
  /** Today's total so far — kept live by the caller, not re-read here. */
  readonly kcal: number;
  readonly protein: number;
  /** The day's targets from `getSettings()`. Ignored (rings read `0`) while `isDefault` is true. */
  readonly kcalTarget: number;
  readonly proteinTarget: number;
  /** `getSettings().isDefault` — no target has ever been saved. */
  readonly isDefault: boolean;
  /** The device instant and IANA zone the date header is drawn for (`deviceWhen()`). */
  readonly at: number;
  readonly timeZone: string;
  readonly theme: Theme;
  /** Formatting locale. Defaults to the device's. */
  readonly locale?: string;
  readonly testID?: string;
};

function textStyle(token: TypeStyle, color: string): TextStyle {
  return {
    fontFamily: token.fontFamily,
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    textTransform: token.textTransform,
    color,
  };
}

export function TodayHeader({
  kcal,
  protein,
  kcalTarget,
  proteinTarget,
  isDefault,
  at,
  timeZone,
  theme,
  locale,
  testID = 'today-header',
}: TodayHeaderProps) {
  const router = useRouter();
  const { text, card, line, data } = theme.color;

  const dateLabel = formatTodayDate(at, timeZone, locale);
  const kcalGoal = isDefault ? 0 : kcalTarget;
  const proteinGoal = isDefault ? 0 : proteinTarget;

  const handleSetTargets = (): void => {
    router.push('/settings');
  };

  return (
    <View testID={testID}>
      <View style={styles.headerRow}>
        <Text testID={`${testID}-date`} accessibilityRole="header" style={textStyle(type.title, text.primary)}>
          {dateLabel}
        </Text>
        {isDefault ? (
          <Pressable
            testID={`${testID}-set-targets`}
            onPress={handleSetTargets}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Daily targets not set. Tap to set them in Settings."
            hitSlop={space[2]}
            style={styles.setTargets}
          >
            <Text style={textStyle(type.label, data.kcal)}>Set</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: card.bg, borderColor: card.border }]}>
        <View style={styles.ringsRow}>
          <ProgressArc metric="kcal" value={kcal} target={kcalGoal} theme={theme} locale={locale} testID={`${testID}-kcal-arc`} />
          <View style={[styles.divider, { backgroundColor: line.hairline }]} />
          <ProgressArc
            metric="protein"
            value={protein}
            target={proteinGoal}
            theme={theme}
            locale={locale}
            testID={`${testID}-protein-arc`}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space[3],
  },
  setTargets: {
    minHeight: size.tapTargetMin,
    minWidth: size.tapTargetMin,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[3],
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: layout.cardPadding,
  },
  ringsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: size.arc.diameter,
  },
});
