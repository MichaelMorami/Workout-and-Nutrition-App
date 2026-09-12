/**
 * The charts layer's public surface. Screens import from here, never from a file inside.
 *
 * Charts are a pure presentation layer: everything they draw arrives as typed props. They never
 * reach into sync state or a screen (`scripts/boundaries.sh` enforces it).
 */
export { ProgressArc, type ProgressArcProps } from './ProgressArc';
export {
  arcCaption,
  arcModel,
  arcStatus,
  dashOffset,
  firstLapFraction,
  overLapFraction,
  progressRatio,
  ringGeometry,
  targetTickLine,
  type ArcCaptionInput,
  type ArcMetric,
  type ArcModel,
  type ArcModelInput,
  type ArcStatus,
  type RingGeometry,
  type TickLine,
} from './arc-math';
