// QRdx for Google Docs, Sheets and Slides: a Google Workspace add-on (Card
// service) with one sidebar card. Pick what the code does and how it looks,
// then insert it: an image saved in the file, drawn by QRdx's keyless image
// API (image-url.js) from the content payload.js builds. In Sheets, a column
// of values can also get =IMAGE() formulas instead.
//
// Entry points (named in appsscript.json and in the card's actions):
// onHomepage, onTypeChange, onPreview, onInsert, onWriteFormulas.
//
// Nothing here logs, stores or sends anything but the image request.

/** Where Insert puts the code, per host app (e.hostApp). */
const HOST_TEXT = {
  docs: {
    insert: "Insert at cursor",
    where:
      "Insert puts the code at your cursor, as an image saved in the document.",
  },
  slides: {
    insert: "Add to slide",
    where:
      "Insert puts the code in the middle of the current slide, as an image saved in the presentation.",
  },
  sheets: {
    insert: "Insert over sheet",
    where:
      "Insert places the code over the sheet at the selected cell, as an image saved in the spreadsheet.",
  },
};

/**
 * The sidebar's fields for a content type. A function, not a constant: it
 * uses WIFI_SECURITY from payload.js, and Apps Script may load that file
 * after this one.
 */
function typeFields(type) {
  return {
    url: [{ name: "url", title: "Link", hint: "example.com/menu" }],
    text: [{ name: "text", title: "Text", multiline: true }],
    wifi: [
      { name: "ssid", title: "Network name" },
      {
        name: "password",
        title: "Password",
        hint: "For an open network, pick None under Security.",
      },
      { name: "security", title: "Security", options: WIFI_SECURITY },
      {
        name: "hidden",
        checkbox: "Hidden network (it doesn't broadcast its name)",
      },
    ],
    email: [
      { name: "to", title: "Send to", hint: "name@example.com" },
      { name: "subject", title: "Subject (optional)" },
      { name: "body", title: "Message (optional)", multiline: true },
    ],
    phone: [{ name: "phone", title: "Phone number", hint: "+1 415 555 0123" }],
    sms: [
      { name: "phone", title: "Phone number", hint: "+1 415 555 0123" },
      { name: "message", title: "Message (optional)", multiline: true },
    ],
  }[type];
}

const TEXT_FIELD_NAMES = [
  "url",
  "text",
  "ssid",
  "password",
  "security",
  "to",
  "subject",
  "body",
  "phone",
  "message",
];

/** Pixels per inch in Docs and Sheets, points per inch in Slides. */
const PIXELS_PER_INCH = 96;
const POINTS_PER_INCH = 72;

// ── Reading the event ─────────────────────────────────────────────────────

/** "docs", "sheets" or "slides": the app the sidebar is open in. */
function hostOf(e) {
  return String(
    e?.hostApp ?? e?.commonEventObject?.hostApp ?? ""
  ).toLowerCase();
}

/** Every form input as a list of strings, whichever event shape arrives. */
function readForm(e) {
  const form = {};
  const inputs = e?.commonEventObject?.formInputs;
  if (inputs) {
    for (const name of Object.keys(inputs)) {
      form[name] = inputs[name]?.stringInputs?.value ?? [];
    }
    return form;
  }
  const lists = e?.formInputs ?? {};
  for (const name of Object.keys(lists)) form[name] = lists[name] ?? [];
  const single = e?.formInput ?? {};
  for (const name of Object.keys(single)) {
    if (!(name in form)) form[name] = [single[name]];
  }
  return form;
}

/** What the card shows: the type, its fields, the look and the size. */
function cardState(e) {
  const form = readForm(e);
  const first = (name) => String(form[name]?.[0] ?? "");
  const type = QR_TYPES.some((option) => option.id === first("type"))
    ? first("type")
    : "url";
  const fields = { hidden: (form.hidden ?? []).includes("true") };
  for (const name of TEXT_FIELD_NAMES) fields[name] = first(name);
  return {
    type,
    style: presetById(first("style")).id,
    size: sizeById(first("size")).id,
    fields,
  };
}

function defaultState() {
  return cardState({});
}

// ── The card ──────────────────────────────────────────────────────────────

function dropdown(name, title, options, selected) {
  const input = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName(name)
    .setTitle(title);
  for (const option of options) {
    input.addItem(option.label, option.id, option.id === selected);
  }
  return input;
}

function fieldWidget(field, state) {
  if (field.options) {
    const selected = state.fields[field.name] || field.options[0].id;
    return dropdown(field.name, field.title, field.options, selected);
  }
  if (field.checkbox) {
    return CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.CHECK_BOX)
      .setFieldName(field.name)
      .addItem(field.checkbox, "true", state.fields[field.name] === true);
  }
  const input = CardService.newTextInput()
    .setFieldName(field.name)
    .setTitle(field.title)
    .setValue(state.fields[field.name] ?? "");
  if (field.hint) input.setHint(field.hint);
  if (field.multiline) input.setMultiline(true);
  return input;
}

function action(functionName) {
  return CardService.newAction()
    .setFunctionName(functionName)
    .setLoadIndicator(CardService.LoadIndicator.SPINNER);
}

function contentSection(state) {
  const section = CardService.newCardSection().addWidget(
    dropdown("type", "The code opens", QR_TYPES, state.type).setOnChangeAction(
      action("onTypeChange")
    )
  );
  for (const field of typeFields(state.type)) {
    section.addWidget(fieldWidget(field, state));
  }
  return section;
}

function styleSection(state, host) {
  return CardService.newCardSection()
    .setHeader("Look")
    .addWidget(dropdown("style", "Style", STYLE_PRESETS, state.style))
    .addWidget(dropdown("size", "Size", CODE_SIZES, state.size))
    .addWidget(
      CardService.newTextParagraph().setText(
        `${HOST_TEXT[host]?.where ?? ""} The content is sent to QRdx's image API (api.qrdx.dev) to draw it.`.trim()
      )
    );
}

function previewSection(preview) {
  return CardService.newCardSection()
    .setHeader("Preview")
    .addWidget(
      CardService.newImage()
        .setImageUrl(preview.dataUri)
        .setAltText(preview.description)
    )
    .addWidget(
      CardService.newTextParagraph().setText(
        "Scan it with your phone's camera to check it."
      )
    );
}

function formulaSection() {
  return CardService.newCardSection()
    .setHeader("Codes for a list")
    .addWidget(
      CardService.newTextParagraph().setText(
        `Select the cells in one column that hold the links or text (not the header), up to ${FORMULA_MAX_ROWS} rows. The next column gets an =IMAGE() formula in each row, in the style and size above. Sheets loads those codes from api.qrdx.dev instead of saving them in the file, so each cell's text travels in the image's address, and a code changes when you edit its cell.`
      )
    )
    .addWidget(
      CardService.newTextButton()
        .setText("Add =IMAGE() formulas")
        .setOnClickAction(action("onWriteFormulas"))
    );
}

function dynamicSection() {
  return CardService.newCardSection()
    .addWidget(
      CardService.newTextParagraph().setText(
        "Need to change the link after printing or count scans? Make a dynamic code on qrdx.dev."
      )
    )
    .addWidget(
      CardService.newTextButton()
        .setText("Make a dynamic code")
        .setOpenLink(
          CardService.newOpenLink()
            .setUrl(DYNAMIC_CODE_URL)
            .setOpenAs(CardService.OpenAs.FULL_SIZE)
            .setOnClose(CardService.OnClose.NOTHING)
        )
    );
}

function buildCard(host, state, preview) {
  const card = CardService.newCardBuilder();
  if (preview) card.addSection(previewSection(preview));
  card.addSection(contentSection(state));
  card.addSection(styleSection(state, host));
  if (host === "sheets") card.addSection(formulaSection());
  card.addSection(dynamicSection());
  card.setFixedFooter(
    CardService.newFixedFooter()
      .setPrimaryButton(
        CardService.newTextButton()
          .setText(HOST_TEXT[host]?.insert ?? "Insert")
          .setOnClickAction(action("onInsert"))
      )
      .setSecondaryButton(
        CardService.newTextButton()
          .setText("Preview")
          .setOnClickAction(action("onPreview"))
      )
  );
  return card.build();
}

function notify(text) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(text))
    .build();
}

function showCard(card) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

// ── The image ─────────────────────────────────────────────────────────────

/**
 * The PNG at `url` as a blob: { ok: true, blob } or { ok: false, message }.
 * Errors never echo the address, which holds the content.
 */
function fetchQrImage(url) {
  let response;
  try {
    response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch {
    return {
      ok: false,
      message: "QRdx couldn't be reached. Try again in a moment.",
    };
  }
  const status = response.getResponseCode();
  if (status !== 200) {
    return {
      ok: false,
      message: apiErrorMessage(status, response.getContentText()),
    };
  }
  return { ok: true, blob: response.getBlob().setName("qr-code.png") };
}

// ── Placing it ────────────────────────────────────────────────────────────
// Each placer checks there's somewhere to put the code before it calls
// loadImage(), so nothing is sent to QRdx when the code can't be placed.
// It returns the sentence to show.

function placeInDocs(loadImage, placement) {
  const document = DocumentApp.getActiveDocument();
  const cursor = document.getCursor();
  if (!cursor) {
    return "Click in the document where the code should go (without selecting text), then insert again.";
  }
  const loaded = loadImage();
  if (!loaded.ok) return loaded.message;
  const image = cursor.insertInlineImage(loaded.blob);
  if (!image) {
    return "The code can't go at that spot. Click in a line of text and try again.";
  }
  const pixels = Math.round(placement.inches * PIXELS_PER_INCH);
  image
    .setWidth(pixels)
    .setHeight(pixels)
    .setAltTitle("QR code")
    .setAltDescription(placement.description);
  if (placement.link) image.setLinkUrl(placement.link);
  return "QR code inserted.";
}

function placeInSlides(loadImage, placement) {
  const presentation = SlidesApp.getActivePresentation();
  const page = presentation.getSelection().getCurrentPage();
  if (!page) return "Select a slide, then insert again.";
  const loaded = loadImage();
  if (!loaded.ok) return loaded.message;
  const points = placement.inches * POINTS_PER_INCH;
  const image = page.insertImage(loaded.blob);
  image
    .setWidth(points)
    .setHeight(points)
    .setLeft((presentation.getPageWidth() - points) / 2)
    .setTop((presentation.getPageHeight() - points) / 2)
    .setTitle("QR code")
    .setDescription(placement.description);
  if (placement.link) image.setLinkUrl(placement.link);
  image.select();
  return "QR code added to the slide.";
}

function placeInSheets(loadImage, placement) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const cell = spreadsheet.getCurrentCell();
  const sheet = cell ? cell.getSheet() : spreadsheet.getActiveSheet();
  const column = cell ? cell.getColumn() : 1;
  const row = cell ? cell.getRow() : 1;
  const loaded = loadImage();
  if (!loaded.ok) return loaded.message;
  const pixels = Math.round(placement.inches * PIXELS_PER_INCH);
  sheet
    .insertImage(loaded.blob, column, row)
    .setWidth(pixels)
    .setHeight(pixels)
    .setAltTextTitle("QR code")
    .setAltTextDescription(placement.description);
  return `QR code placed over cell ${columnLetter(column)}${row}.`;
}

const PLACERS = {
  docs: placeInDocs,
  slides: placeInSlides,
  sheets: placeInSheets,
};

const HOST_NAMES = {
  docs: "Google Docs",
  slides: "Google Slides",
  sheets: "Google Sheets",
};

/**
 * Writes =IMAGE() formulas next to a one-column range and sizes the cells.
 * Returns the sentence to show. Never overwrites a cell that has anything.
 */
function writeImageFormulas(range, presetId, size) {
  if (!range) return "Select the cells that hold the links or text first.";
  if (range.getNumColumns() !== 1) {
    return "Select cells in one column: the codes go in the column to its right.";
  }
  const rows = range.getNumRows();
  if (rows > FORMULA_MAX_ROWS) {
    return `Select at most ${FORMULA_MAX_ROWS} rows at a time (you selected ${rows}).`;
  }
  const sheet = range.getSheet();
  const column = range.getColumn();
  const letter = columnLetter(column + 1);
  if (column >= sheet.getMaxColumns()) sheet.insertColumnAfter(column);
  const target = sheet.getRange(range.getRow(), column + 1, rows, 1);
  const filled = countFilledCells(target.getValues(), target.getFormulas());
  if (filled > 0) {
    return `Column ${letter} already has something in ${filled} of these rows. Insert an empty column to the right of your list, then try again.`;
  }
  const pixels = Math.round(size.inches * PIXELS_PER_INCH);
  // Twice the cell's size, so the codes stay sharp on high-density screens.
  target.setFormulaR1C1(imageFormulaR1C1("R[0]C[-1]", presetId, pixels * 2));
  sheet.setColumnWidth(column + 1, pixels);
  sheet.setRowHeights(range.getRow(), rows, pixels);
  const codes = rows === 1 ? "1 code" : `${rows} codes`;
  return `Added ${codes} in column ${letter}. Sheets loads them from api.qrdx.dev.`;
}

// ── Entry points ──────────────────────────────────────────────────────────

/** The sidebar's first card, in Docs, Sheets and Slides. */
function onHomepage(e) {
  return buildCard(hostOf(e), defaultState());
}

/** The type changed: show its fields, keeping the look and size. */
function onTypeChange(e) {
  return showCard(buildCard(hostOf(e), cardState(e)));
}

function onPreview(e) {
  const state = cardState(e);
  const payload = buildPayload(state.type, state.fields);
  if (!payload.ok) return notify(payload.message);
  const request = fetchableImageUrl(payload.data, state.style, 256);
  if (!request.ok) return notify(request.message);
  const image = fetchQrImage(request.url);
  if (!image.ok) return notify(image.message);
  const dataUri = `data:image/png;base64,${Utilities.base64Encode(image.blob.getBytes())}`;
  return showCard(
    buildCard(hostOf(e), state, { dataUri, description: payload.description })
  );
}

function onInsert(e) {
  const host = hostOf(e);
  const place = PLACERS[host];
  if (!place) return notify("Open QRdx from Google Docs, Sheets or Slides.");
  const state = cardState(e);
  const payload = buildPayload(state.type, state.fields);
  if (!payload.ok) return notify(payload.message);
  const size = sizeById(state.size);
  // Checked before the placer runs, so nothing in the file changes either.
  const request = fetchableImageUrl(
    payload.data,
    state.style,
    fetchPixels(size.inches)
  );
  if (!request.ok) return notify(request.message);
  try {
    return notify(
      place(() => fetchQrImage(request.url), {
        inches: size.inches,
        description: payload.description,
        link: payload.link,
      })
    );
  } catch (error) {
    return notify(
      `${HOST_NAMES[host]} couldn't insert the code: ${error?.message ?? error}`
    );
  }
}

function onWriteFormulas(e) {
  if (hostOf(e) !== "sheets") {
    return notify("Formulas are for Google Sheets.");
  }
  const state = cardState(e);
  try {
    const range = SpreadsheetApp.getActiveSpreadsheet().getActiveRange();
    return notify(writeImageFormulas(range, state.style, sizeById(state.size)));
  } catch (error) {
    return notify(
      `Google Sheets couldn't add the formulas: ${error?.message ?? error}`
    );
  }
}
