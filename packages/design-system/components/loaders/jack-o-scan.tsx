import { type LoaderProps, LoaderSvg } from "./loader-svg";

/**
 * Scanframe for Halloween (20 Oct – 2 Nov): the same breathing brackets in
 * pumpkin orange round a jack-o'-lantern face that flickers like
 * candlelight. The eyes are the X's two top modules cut into triangles and
 * the X's lower half becomes a jagged grin; square modules didn't read as a
 * face below 64 px. The app swaps it in for Scanframe during the season; it
 * takes no brand accent, since the orange is the season's one colour.
 */
export function JackOScan({ size = 40, ...props }: LoaderProps) {
  return (
    <LoaderSvg size={size} viewBox="0 0 48 48" {...props}>
      <g className="qrdx-loader-pumpkin">
        <path
          className="qrdx-loader-bracket qrdx-loader-breathe-tl"
          d="M4 16V10a6 6 0 0 1 6-6h6"
        />
        <path
          className="qrdx-loader-bracket qrdx-loader-breathe-tr"
          d="M32 4h6a6 6 0 0 1 6 6v6"
        />
        <path
          className="qrdx-loader-bracket qrdx-loader-breathe-br"
          d="M44 32v6a6 6 0 0 1-6 6h-6"
        />
        <path
          className="qrdx-loader-bracket qrdx-loader-breathe-bl"
          d="M16 44h-6a6 6 0 0 1-6-6v-6"
        />
        <path
          className="qrdx-loader-face qrdx-loader-flicker"
          d="M17 13.5l3.6 6.3h-7.2ZM31 13.5l3.6 6.3h-7.2Z"
          strokeWidth="1.6"
        />
        <path
          className="qrdx-loader-face qrdx-loader-flicker-late"
          d="M12.5 26.5l4 3 3.75-3 3.75 3 3.75-3 3.75 3 4-3c0 5-5 9-11.5 9s-11.5-4-11.5-9Z"
          strokeWidth="1.2"
        />
      </g>
    </LoaderSvg>
  );
}
