/**
 * Overrides `@react-native/jest-preset/jest/mocks/Modal.js`.
 *
 * The preset's own `Modal` mock renders only `{this.props.children}`. The real component
 * (`react-native/Libraries/Modal/Modal.js:352-360`, RN 0.86.3) wraps its children in
 * `<VirtualizedListContextResetter><ScrollView.Context.Provider value={null}>` before they ever
 * reach the screen. Without that reset in the mock, a `FlatList` that is a genuine descendant of
 * a real `ScrollView` — true for `SearchSheet`'s `FlatList`, which sits inside a `Modal` inside
 * the Today screen's `ScrollView` — trips the dev-mode nesting guard at
 * `@react-native/virtualized-lists/Lists/VirtualizedList.js:1152-1165` purely because the *mock*
 * omits a reset every real device performs automatically. See issue #245 and the analysis at
 * https://github.com/MichaelMorami/Workout-and-Nutrition-App/pull/244#issuecomment-6149675578.
 *
 * This subclasses the preset's own mock — never `node_modules` itself — so `visible` handling,
 * the host element name (`'Modal'`, used by `app/(tabs)/index.search-ios.test.tsx` to count
 * presented modals) and every static the preset copies off the real `Modal` class stay exactly as
 * they were. Only the missing context reset is added, around whatever the preset already decided
 * to render.
 */
import * as React from 'react';

// The preset's mock (`@react-native/jest-preset/jest/mocks/Modal.js`) is a Flow-only file with no
// published TS types, and `jest.requireActual`'s own return type is `unknown` — there is no shape
// to narrow either side of this to that `extends` would accept, so `any` is the honest type for
// both the cast off `unknown` and the constructor this file subclasses.
const PresetModal = jest.requireActual('@react-native/jest-preset/jest/mocks/Modal') as {
  default: any;
};

/**
 * The shape `ScrollView.Context` actually has at runtime, confirmed against
 * `react-native/Libraries/Components/ScrollView/ScrollView.js:737`
 * (`static Context: typeof ScrollViewContext = ScrollViewContext;`) and
 * `ScrollViewContext.js` (`type Value = {horizontal: boolean} | null`). Neither file is part of
 * `react-native`'s public `.d.ts`, so this is the narrowest true type, not a blanket `any`.
 */
type ScrollViewContextValue = { horizontal: boolean } | null;
interface ScrollViewStatics {
  Context: React.Context<ScrollViewContextValue>;
}

// Resolved through the same module registry `@react-native/virtualized-lists/Lists/VirtualizedList.js`
// uses for its own `ScrollView.Context.Consumer` check, so this is always the identical `Context`
// object — whether `react-native/Libraries/Components/ScrollView/ScrollView` is currently the
// preset's mock (which copies the real class's `static Context` across unchanged) or the real
// module, as `app/(tabs)/index.search-ios.test.tsx` deliberately un-mocks it to.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ScrollView = require('react-native/Libraries/Components/ScrollView/ScrollView')
  .default as ScrollViewStatics;

// `@react-native/virtualized-lists`'s own `.d.ts` (`index.d.ts`) only re-exports types from
// `VirtualizedList` — it does not declare the runtime default export's shape at all (the real
// `export default { get VirtualizedListContextResetter() {...}, ... }` in `index.js` is untyped),
// so a typed `import` here would fail to resolve a member that provably exists at runtime. `require`
// plus a narrow local annotation is the accurate type for the one member this file uses.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { VirtualizedListContextResetter } = require('@react-native/virtualized-lists').default as {
  VirtualizedListContextResetter: React.ComponentType<{ children?: React.ReactNode }>;
};

type RenderedModal = React.ReactElement<{ children?: React.ReactNode }> | null;

export default class Modal extends PresetModal.default {
  render(): React.ReactNode {
    const rendered: RenderedModal = super.render();
    if (rendered == null) return rendered; // `visible === false`: nothing to wrap, same as the preset.

    return React.cloneElement(
      rendered,
      undefined,
      <VirtualizedListContextResetter>
        <ScrollView.Context.Provider value={null}>{rendered.props.children}</ScrollView.Context.Provider>
      </VirtualizedListContextResetter>,
    );
  }
}
