// QUALITY for RiversOfRust: phones and tablets start lighter (fewer pixels, smaller shadow maps, less dust); the
// governor in main.js then steps the resolution down while the frame rate is low and back up when there is room.
import { IN } from './input.js';
export const Q = {
  low: IN.mobile,
  maxRatio: IN.mobile ? 1.5 : 2,
  shadow: IN.mobile ? 1024 : 2048,
  dust: IN.mobile ? 160 : 420
};
