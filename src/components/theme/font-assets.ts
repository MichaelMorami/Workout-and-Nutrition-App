import type { FontFamily } from '../../theme/tokens';

/**
 * The physical font file behind every key in `fontInstances`, for `expo-font`'s `useFonts`. The
 * `Record<FontFamily, ...>` annotation is what proves every instance has a file and no stray key
 * exists — TypeScript rejects the object literal below if a key is missing or extra.
 *
 * BLOCKED (raised on #39): `assets/fonts/*.ttf` are not in the repo yet. They are the 8 static
 * cuts of the Archivo variable font at the (wght, wdth) values in `fontInstances` — see the
 * tech-lead hand-off on #20 ("ui-engineer / release-engineer: needs another owner"). This file is
 * the seam `app/_layout.tsx` loads through; once the `.ttf` files land at the paths below, no
 * other change is needed.
 */
export const fontAssetMap: Record<FontFamily, number> = {
  'Archivo-Book': require('../../../assets/fonts/Archivo-Book.ttf') as number,
  'Archivo-Medium': require('../../../assets/fonts/Archivo-Medium.ttf') as number,
  'Archivo-SemiBold': require('../../../assets/fonts/Archivo-SemiBold.ttf') as number,
  'Archivo-Bold': require('../../../assets/fonts/Archivo-Bold.ttf') as number,
  'Archivo-Title': require('../../../assets/fonts/Archivo-Title.ttf') as number,
  'Archivo-Numeric': require('../../../assets/fonts/Archivo-Numeric.ttf') as number,
  'Archivo-Display': require('../../../assets/fonts/Archivo-Display.ttf') as number,
  'Archivo-DisplayXl': require('../../../assets/fonts/Archivo-DisplayXl.ttf') as number,
};
