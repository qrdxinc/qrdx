// The engine's canvas-to-BMP writer on its own, for a dynamic import: a
// dynamic import of "qrdx" itself would load the whole package namespace,
// the official frame library included.
export { canvasToBMP } from "qrdx";
