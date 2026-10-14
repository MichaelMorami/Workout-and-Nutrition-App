/**
 * `<CarouselPage>` (issue #82) — wraps a tab root's content so the shared `dragX` value from
 * `useTabCarousel` (via `CarouselContext`) moves the whole screen with the finger. Outside the
 * context — any screen that is not a tab root, or a test that renders one in isolation — it falls
 * back to its own static `SharedValue`, so no consumer breaks for lack of a provider.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { CarouselContext, CarouselPage } from './CarouselPage';

jest.mock('react-native-reanimated', () => jest.requireActual('./test-support/reanimated-mock'));

function translateXOf(testID: string): number {
  const style = StyleSheet.flatten(screen.getByTestId(testID).props.style) as {
    readonly transform: readonly { readonly translateX: number }[];
  };
  const [slide] = style.transform;
  if (slide === undefined) throw new Error('CarouselPage is not on a translateX track');
  return slide.translateX;
}

describe('CarouselPage', () => {
  it('renders its children', async () => {
    await render(
      <CarouselPage testID="page">
        <Text>Today</Text>
      </CarouselPage>,
    );
    expect(screen.getByText('Today')).toBeTruthy();
  });

  it('sits at translateX 0 with no provider in the tree', async () => {
    await render(
      <CarouselPage testID="page">
        <Text>Today</Text>
      </CarouselPage>,
    );
    expect(translateXOf('page')).toBe(0);
  });

  it('tracks a provided dragX value', async () => {
    function Harness() {
      const dragX = useSharedValue(0);
      dragX.value = -42;
      return (
        <CarouselContext.Provider value={{ dragX }}>
          <CarouselPage testID="page">
            <Text>Today</Text>
          </CarouselPage>
        </CarouselContext.Provider>
      );
    }
    await render(<Harness />);
    expect(translateXOf('page')).toBe(-42);
  });
});
