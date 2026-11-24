// jspdf is an optional peer dependency, loaded only when a PDF is made.

type JsPDFModule = typeof import("jspdf");

// webpack 5 reports an import() of a package that isn't installed as a
// warning, rather than failing the build, only when the import() sits
// right inside a try block. An app whose Babel turns async functions into
// generators (for older browsers) moves an awaited import() out of its try,
// so the import() has a function of its own that isn't async, where the try
// stays put. The legacy build, for webpack 4, leaves this import() to the
// browser instead (tsup.config.ts).
function importJsPDF(): Promise<JsPDFModule> {
  try {
    return import("jspdf");
  } catch (error) {
    // A bundle made without jspdf throws here, synchronously.
    return Promise.reject(error);
  }
}

/** jspdf's `jsPDF` class, or an error that says how to install jspdf. */
export async function loadJsPDF(): Promise<JsPDFModule["jsPDF"]> {
  try {
    return (await importJsPDF()).jsPDF;
  } catch (error) {
    throw new Error(
      `PDF export needs the optional "jspdf" package. Install it with \`npm install jspdf\`; a page that loads qrdx without a bundler, or from a webpack 4 build, maps "jspdf" in its import map. (${error})`
    );
  }
}
