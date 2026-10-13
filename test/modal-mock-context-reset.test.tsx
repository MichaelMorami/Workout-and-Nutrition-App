/**
 * Issue #245 — the jest `Modal` mock's `ScrollView.Context` reset.
 *
 * `@react-native/jest-preset/jest/mocks/Modal.js` renders only `{this.props.children}`. The real
 * `react-native/Libraries/Modal/Modal.js:352-360` wraps its children in
 * `<VirtualizedListContextResetter><ScrollView.Context.Provider value={null}>` first — a `Modal`
 * is a portal, not a true React context boundary, so without that explicit reset a `FlatList`
 * that is a genuine descendant of a real `ScrollView` would otherwise inherit that `ScrollView`'s
 * context straight through the `Modal`. `test/setup/mocks/Modal.tsx` (wired in
 * `test/setup/native.ts`) adds the missing reset by subclassing the preset's own mock.
 *
 * The acceptance criterion that actually matters is the fourth test below: a genuine nesting
 * (no `Modal` in between) must still warn. Anything less is indistinguishable from muting
 * `console.error` globally. See the PR body for the mutation-testing proof that it does.
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react-native';
import { FlatList, Modal, ScrollView, Text } from 'react-native';

/**
 * `@react-native/jest-preset/jest/mocks/ScrollView.js` never provides `ScrollView.Context` at
 * all — it renders `<RCTScrollView><View>{children}</View></RCTScrollView>` with no
 * `.Context.Provider`, so a plain-mocked `ScrollView` can never trip the nesting guard either way
 * and the fourth acceptance box (a genuine nesting still warns) would be untestable under it.
 * The real `ScrollView` does provide it (same as `app/(tabs)/index.search-ios.test.tsx`, which
 * un-mocks it for exactly this reason) — this file needs the genuine behaviour on both sides of
 * the boundary it is proving, not just the `Modal` side.
 */
jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () =>
  jest.requireActual('react-native/Libraries/Components/ScrollView/ScrollView'),
);

const NESTING_WARNING =
  'VirtualizedLists should never be nested inside plain ScrollViews with the same orientation because it can break windowing and other functionality - use another VirtualizedList-backed container instead.';

/** Three rows is enough to give `FlatList` something real to render; the count is not the point. */
const ROWS = ['a', 'b', 'c'];

describe('the Modal mock still renders children and respects `visible` (unchanged by the reset)', () => {
  it('renders its children while visible', async () => {
    await render(
      <Modal visible>
        <Text>inside the modal</Text>
      </Modal>,
    );

    expect(screen.getByText('inside the modal')).toBeTruthy();
  });

  it('renders nothing when `visible={false}`, exactly as before the reset was added', async () => {
    await render(
      <Modal visible={false}>
        <Text>inside the modal</Text>
      </Modal>,
    );

    expect(screen.queryByText('inside the modal')).toBeNull();
  });
});

describe('a FlatList inside a Modal inside a ScrollView — the SearchSheet shape — never warns', () => {
  it('logs nothing: the Modal resets ScrollView.Context before the FlatList sees it', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await render(
      <ScrollView>
        <Modal visible>
          <FlatList data={ROWS} keyExtractor={(row) => row} renderItem={({ item }) => <Text>{item}</Text>} />
        </Modal>
      </ScrollView>,
    );

    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('VirtualizedLists should never be nested'));
  });
});

describe('a genuine nesting — no Modal between the FlatList and the ScrollView — still warns', () => {
  it('logs the nesting warning exactly as the real component would on-device', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await render(
      <ScrollView>
        <FlatList data={ROWS} keyExtractor={(row) => row} renderItem={({ item }) => <Text>{item}</Text>} />
      </ScrollView>,
    );

    expect(consoleError).toHaveBeenCalledWith(NESTING_WARNING);
  });

  it('stays silent when the nested list opts out with scrollEnabled={false} — the guard reads that prop too', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await render(
      <ScrollView>
        <FlatList
          scrollEnabled={false}
          data={ROWS}
          keyExtractor={(row) => row}
          renderItem={({ item }) => <Text>{item}</Text>}
        />
      </ScrollView>,
    );

    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('VirtualizedLists should never be nested'));
  });
});
