import { type LoaderProps, LoaderSvg } from "./loader-svg";

/**
 * The loader for checking and uploading: scan scores, verification, uploads.
 * A QR finder eye (a 7-module ring round a 3×3 centre) whose ring draws
 * itself around and unwinds (1.8 s) while the centre pulses in the brand
 * accent. The ring is one module thick; it starts mid-edge, so its round
 * ends meet on a straight line when it closes.
 */
export function FinderTrace({ size = 24, ...props }: LoaderProps) {
  return (
    <LoaderSvg size={size} viewBox="0 0 48 48" {...props}>
      <path
        className="qrdx-loader-ring qrdx-loader-trace"
        d="M24 6h12a6 6 0 0 1 6 6v24a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6Z"
        pathLength={100}
      />
      <rect
        className="qrdx-loader-accent qrdx-loader-pulse"
        height="18"
        rx="4"
        width="18"
        x="15"
        y="15"
      />
    </LoaderSvg>
  );
}
