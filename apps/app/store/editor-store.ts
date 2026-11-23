import type { ColorConfig } from "qrdx/types";
import { colorConfigSchema, getSolidColor } from "qrdx/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultThemeState } from "@/config/qr";
import {
  currentGesture,
  noteChange,
  trackGestures,
} from "@/lib/editor-gestures";
import { withTemplateAsFrame } from "@/lib/qr-design/legacy-template";
import { noteEditorVisitStart } from "@/lib/sign-up-nudges";
import { isShuffleId } from "@/lib/themes/shuffle";
import { isDeepEqual } from "@/lib/utils";
import type { QRStyle, ThemeEditorState } from "@/types/editor";
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import { getPresetThemeStyles } from "@/utils/qr-presets-helper";

const MAX_HISTORY_COUNT = 30;

const withoutGesture = ({ gesture: _gesture, ...entry }: QRHistoryEntry) =>
  entry;

// One undo step per input gesture (lib/editor-gestures.ts): a slider or
// color drag is one step, two picks are two, however fast.
if (typeof document !== "undefined") trackGestures(document);

/**
 * The look a state's preset stands for: what Reset returns to and what the
 * unsaved-changes check compares against. A shuffle uses the styles it
 * resolved to when applied; other presets are looked up by id.
 */
export function presetBaseStyles(state: ThemeEditorState): QRStyle {
  if (state.presetStyles && isShuffleId(state.preset)) {
    return state.presetStyles;
  }
  return getPresetThemeStyles(state.preset ?? "default");
}

/** `state` showing `preset`, keeping the resolved look only for shuffles. */
function withPreset(
  state: ThemeEditorState,
  preset: string,
  styles: QRStyle,
): ThemeEditorState {
  const { presetStyles: _previous, ...rest } = state;
  return isShuffleId(preset)
    ? { ...rest, preset, styles: { ...styles }, presetStyles: styles }
    : { ...rest, preset, styles };
}

/**
 * Drops a resolved look that no longer belongs to the state's preset, as
 * when a caller spreads the current state and sets another preset id.
 */
function withOwnPresetStyles(
  next: ThemeEditorState,
  previous: ThemeEditorState,
): ThemeEditorState {
  const carriedOver =
    next.preset !== previous.preset &&
    next.presetStyles === previous.presetStyles;
  if (!next.presetStyles || (isShuffleId(next.preset) && !carriedOver)) {
    return next;
  }
  const { presetStyles: _stale, ...rest } = next;
  return rest;
}

/**
 * `state` with the template its styles name read as its frame (designs from
 * before templates were frames; lib/qr-design/legacy-template.ts).
 */
function withTemplateFrame(state: ThemeEditorState): ThemeEditorState {
  const styles = withTemplateAsFrame(state.styles);
  const presetStyles = state.presetStyles
    ? withTemplateAsFrame(state.presetStyles)
    : state.presetStyles;
  return styles === state.styles && presetStyles === state.presetStyles
    ? state
    : { ...state, styles, ...(presetStyles && { presetStyles }) };
}

/**
 * Gives a persisted shuffle state its resolved look. States saved before
 * `presetStyles` existed resolve the id once on load (what they did on every
 * check before) and keep that look from then on.
 */
function freezeShuffleStyles(state: unknown) {
  if (!state || typeof state !== "object") return;
  const entry = state as Partial<ThemeEditorState>;
  if (!isShuffleId(entry.preset)) return;
  if (!entry.presetStyles || typeof entry.presetStyles !== "object") {
    entry.presetStyles = getPresetThemeStyles(entry.preset as string);
  }
}

/**
 * History entry for QR editor state
 */
interface QRHistoryEntry {
  state: ThemeEditorState;
  timestamp: number;
  /**
   * The input gesture that made this step; later changes in it merge in.
   * Never saved: gesture ids belong to one page load.
   */
  gesture?: string;
}

/**
 * QR Editor Store Interface
 */
interface QREditorStore {
  value: string;
  setValue: (value: string) => void;
  themeState: ThemeEditorState;
  themeCheckpoint: ThemeEditorState | null;
  history: QRHistoryEntry[];
  future: QRHistoryEntry[];
  setThemeState: (state: ThemeEditorState) => void;
  applyThemePreset: (preset: string) => void;
  /** Replaces the whole look as one undo step, like applying a preset. */
  replaceThemeState: (state: ThemeEditorState) => void;
  /**
   * Uses a design from outside the playground (a community theme or frame)
   * as one undo step, so the old design is one Undo away. A theme drops the
   * preset id it no longer matches, as a `style` link does; `keepPreset`
   * keeps it, for a frame added to the current design.
   */
  applyDesign: (styles: QRStyle, options?: { keepPreset?: boolean }) => void;
  saveThemeCheckpoint: () => void;
  restoreThemeCheckpoint: () => void;
  resetToCurrentPreset: () => void;
  hasThemeChangedFromCheckpoint: () => boolean;
  hasUnsavedChanges: () => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /**
   * Shows `state` now without an undo step: a live draft, such as frame text
   * typed in the preview. End it with `commitThemeDraft`, or cancel it by
   * drafting the state it started from.
   */
  draftThemeState: (state: ThemeEditorState) => void;
  /**
   * Ends a draft that started at `before`: one undo step back to it (none
   * when nothing changed). Later edits never merge into that step.
   */
  commitThemeDraft: (before: ThemeEditorState) => void;

  contentType: ContentType;
  setContentType: (contentType: ContentType) => void;

  // Content configurations for each content type
  contentConfigs: Partial<Record<ContentType, QRContentConfig>>;
  setContentConfig: (type: ContentType, config: QRContentConfig) => void;
  getContentConfig: (type: ContentType) => QRContentConfig | undefined;
}

// Whether this tab's visit started with a design kept from an earlier one
// (the "keep your designs" line): read before the store loads its own.
noteEditorVisitStart();

/**
 * QR Editor Store with history and preset management
 */
export const useQREditorStore = create<QREditorStore>()(
  persist(
    (set, get) => ({
      themeState: defaultThemeState,
      themeCheckpoint: null,
      history: [],
      future: [],
      value: "",
      setValue: (value: string) => {
        set({ value });
      },
      contentType: "url",
      setContentType: (contentType: ContentType) => {
        set({ contentType });
      },
      contentConfigs: {},
      setContentConfig: (type: ContentType, config: QRContentConfig) => {
        set((state) => ({
          contentConfigs: {
            ...state.contentConfigs,
            [type]: config,
          },
        }));
      },
      getContentConfig: (type: ContentType) => {
        return get().contentConfigs[type];
      },
      setThemeState: (state: ThemeEditorState) => {
        const oldThemeState = get().themeState;
        const newState = withOwnPresetStyles(
          withTemplateFrame(state),
          oldThemeState,
        );
        let currentHistory = get().history;

        // Check if only currentMode changed
        const oldStateWithoutMode = {
          ...oldThemeState,
        };
        const newStateWithoutMode = { ...newState };

        if (isDeepEqual(oldStateWithoutMode, newStateWithoutMode)) {
          // Only currentMode changed
          // Just update themeState without affecting history or future
          set({ themeState: newState });
          return;
        }

        // A change in the gesture that made the last step merges into it
        // (a drag); anything else is a step of its own
        const gesture = currentGesture();
        const lastHistoryEntry = currentHistory.at(-1);
        if (gesture === null || lastHistoryEntry?.gesture !== gesture) {
          currentHistory = [
            ...currentHistory,
            {
              state: oldThemeState,
              timestamp: Date.now(),
              ...(gesture !== null && { gesture }),
            },
          ];
        }
        if (gesture !== null) noteChange();

        if (currentHistory.length > MAX_HISTORY_COUNT) {
          currentHistory.shift(); // Remove the oldest entry
        }

        set({
          themeState: newState,
          history: currentHistory,
          // Any real change, merged or not, ends what redo could bring back
          future: [],
        });
      },
      applyThemePreset: (preset: string) => {
        const currentThemeState = get().themeState;
        const oldHistory = get().history;
        const currentTime = Date.now();

        // A shuffle id is resolved once, here; the state keeps that look.
        const newThemeState = withPreset(
          currentThemeState,
          preset,
          withTemplateAsFrame(getPresetThemeStyles(preset)),
        );

        const newHistoryEntry = {
          state: currentThemeState,
          timestamp: currentTime,
        };
        const updatedHistory = [...oldHistory, newHistoryEntry];
        if (updatedHistory.length > MAX_HISTORY_COUNT) {
          updatedHistory.shift();
        }

        set({
          themeState: newThemeState,
          themeCheckpoint: newThemeState, // Applying a preset also updates the checkpoint
          history: updatedHistory,
          future: [],
        });
      },
      replaceThemeState: (state: ThemeEditorState) => {
        const currentThemeState = get().themeState;
        const newThemeState = withOwnPresetStyles(
          withTemplateFrame(state),
          currentThemeState,
        );
        // Always its own history entry (setThemeState merges the changes of one
        // gesture).
        const updatedHistory = [
          ...get().history,
          { state: currentThemeState, timestamp: Date.now() },
        ];
        if (updatedHistory.length > MAX_HISTORY_COUNT) {
          updatedHistory.shift();
        }
        set({
          themeState: newThemeState,
          themeCheckpoint: newThemeState,
          history: updatedHistory,
          future: [],
        });
      },
      applyDesign: (styles, { keepPreset = false } = {}) => {
        const { themeState } = get();
        const {
          preset: _preset,
          presetStyles: _presetStyles,
          ...rest
        } = themeState;
        get().replaceThemeState({
          ...(keepPreset ? themeState : rest),
          styles,
        });
      },
      saveThemeCheckpoint: () => {
        set({ themeCheckpoint: get().themeState });
      },
      restoreThemeCheckpoint: () => {
        const checkpoint = get().themeCheckpoint;
        if (checkpoint) {
          const oldThemeState = get().themeState;
          const oldHistory = get().history;
          const currentTime = Date.now();

          const newHistoryEntry = {
            state: oldThemeState,
            timestamp: currentTime,
          };
          const updatedHistory = [...oldHistory, newHistoryEntry];
          if (updatedHistory.length > MAX_HISTORY_COUNT) {
            updatedHistory.shift();
          }

          set({
            themeState: {
              ...checkpoint,
            },
            history: updatedHistory,
            future: [],
          });
        } else {
          console.warn("No theme checkpoint available to restore to.");
        }
      },
      hasThemeChangedFromCheckpoint: () => {
        const checkpoint = get().themeCheckpoint;
        return !isDeepEqual(get().themeState, checkpoint);
      },
      hasUnsavedChanges: () => {
        const themeState = get().themeState;
        return !isDeepEqual(themeState.styles, presetBaseStyles(themeState));
      },
      resetToCurrentPreset: () => {
        const currentThemeState = get().themeState;
        const newThemeState: ThemeEditorState = {
          ...currentThemeState,
          styles: { ...presetBaseStyles(currentThemeState) },
        };

        set({
          themeState: newThemeState,
          themeCheckpoint: newThemeState,
          history: [],
          future: [],
        });
      },
      undo: () => {
        const history = get().history;
        if (history.length === 0) {
          return;
        }

        const currentThemeState = get().themeState;
        const future = get().future;

        const lastHistoryEntry = history[history.length - 1];
        const newHistory = history.slice(0, -1);

        const newFutureEntry = {
          state: currentThemeState,
          timestamp: Date.now(),
        };
        const newFuture = [newFutureEntry, ...future];

        set({
          themeState: {
            ...lastHistoryEntry.state,
          },
          themeCheckpoint: lastHistoryEntry.state,
          history: newHistory,
          future: newFuture,
        });
      },
      redo: () => {
        const future = get().future;
        if (future.length === 0) {
          return;
        }
        const history = get().history;

        const firstFutureEntry = future[0];
        const newFuture = future.slice(1);

        const currentThemeState = get().themeState;

        const newHistoryEntry = {
          state: currentThemeState,
          timestamp: Date.now(),
        };
        const updatedHistory = [...history, newHistoryEntry];
        if (updatedHistory.length > MAX_HISTORY_COUNT) {
          updatedHistory.shift();
        }

        set({
          themeState: {
            ...firstFutureEntry.state,
          },
          themeCheckpoint: firstFutureEntry.state,
          history: updatedHistory,
          future: newFuture,
        });
      },
      canUndo: () => get().history.length > 0,
      canRedo: () => get().future.length > 0,
      draftThemeState: (state: ThemeEditorState) => {
        set({ themeState: withOwnPresetStyles(state, get().themeState) });
      },
      commitThemeDraft: (before: ThemeEditorState) => {
        if (isDeepEqual(before, get().themeState)) return;
        // No gesture of its own, so no later edit merges into it
        const updatedHistory = [
          ...get().history,
          { state: before, timestamp: Date.now() },
        ];
        if (updatedHistory.length > MAX_HISTORY_COUNT) {
          updatedHistory.shift();
        }
        set({ history: updatedHistory, future: [] });
      },
    }),
    {
      name: "editor-storage",
      // Everything is saved but the history's gesture ids, which belong to
      // this page load: a new visit's first gesture must not merge into them
      partialize: (state) => ({
        ...state,
        history: state.history.map(withoutGesture),
        future: state.future.map(withoutGesture),
      }),
      merge: (persistedState, currentState) => {
        // Helper function to normalize ColorConfig in a styles object
        const normalizeColorConfig = (
          styles: Record<string, unknown>,
          key: "fgColor" | "eyeColor" | "dotColor" | "bgColor",
          defaultValue: ColorConfig | string | undefined,
        ) => {
          if (styles[key] !== undefined) {
            try {
              // Validate using zod schema
              const validated = colorConfigSchema.safeParse(styles[key]);
              if (validated.success) {
                // Ensure proper structure - if it's an object, make sure it has required fields
                const colorValue = validated.data as ColorConfig;
                if (typeof colorValue === "string") {
                  // String color is valid
                  styles[key] = colorValue;
                } else if (
                  typeof colorValue === "object" &&
                  colorValue !== null
                ) {
                  // For gradients, ensure stops array is valid and has at least 2 items
                  if (
                    "type" in colorValue &&
                    (colorValue.type === "linear" ||
                      colorValue.type === "radial") &&
                    "stops" in colorValue &&
                    Array.isArray(colorValue.stops)
                  ) {
                    // Ensure stops array has at least 2 items
                    if (colorValue.stops.length < 2) {
                      console.warn(
                        `Gradient stops array has less than 2 items for ${key}, using default`,
                      );
                      styles[key] = defaultValue;
                    } else {
                      // For linear gradients, ensure angle is set (default to 0 if missing)
                      if (
                        colorValue.type === "linear" &&
                        "stops" in colorValue &&
                        Array.isArray(colorValue.stops)
                      ) {
                        const stops = colorValue.stops as Array<{
                          color: string;
                          offset: number;
                        }>;
                        // Always create a new object to ensure angle is present
                        const angleValue =
                          "angle" in colorValue &&
                          typeof colorValue.angle === "number"
                            ? colorValue.angle
                            : 0;
                        styles[key] = {
                          type: "linear",
                          stops,
                          angle: angleValue,
                        } as ColorConfig;
                      } else {
                        // Radial gradient - no angle needed
                        styles[key] = colorValue;
                      }
                    }
                  } else if (
                    "type" in colorValue &&
                    colorValue.type === "solid" &&
                    "color" in colorValue
                  ) {
                    // Solid color is valid
                    styles[key] = colorValue;
                  } else if (
                    "type" in colorValue &&
                    (colorValue.type === "angular" ||
                      colorValue.type === "image")
                  ) {
                    // Angular gradients and image fills passed the schema
                    styles[key] = colorValue;
                  } else {
                    // Invalid structure, use default
                    styles[key] = defaultValue;
                  }
                } else {
                  // Fallback to default
                  styles[key] = defaultValue;
                }
              } else {
                // If validation fails, fall back to default
                console.warn(
                  `Invalid ${key} in persisted state, using default`,
                  validated.error,
                );
                styles[key] = defaultValue;
              }
            } catch (error) {
              console.warn(
                `Error normalizing ${key} from persisted state:`,
                error,
              );
              styles[key] = defaultValue;
            }
          }
        };

        // Helper function to normalize color configs (for backward compatibility)
        const normalizeFgColor = (styles: Record<string, unknown>) => {
          normalizeColorConfig(
            styles,
            "fgColor",
            defaultThemeState.styles.fgColor ?? "#000000",
          );
          normalizeColorConfig(
            styles,
            "bgColor",
            defaultThemeState.styles.bgColor ?? "#ffffff",
          );
          normalizeColorConfig(
            styles,
            "eyeColor",
            getSolidColor(
              defaultThemeState.styles.fgColor,
              "#000000",
            ) as ColorConfig,
          );
          normalizeColorConfig(
            styles,
            "dotColor",
            getSolidColor(
              defaultThemeState.styles.fgColor,
              "#000000",
            ) as ColorConfig,
          );
        };

        // Validate and normalize ColorConfig objects when loading from storage
        if (
          persistedState &&
          typeof persistedState === "object" &&
          "themeState" in persistedState &&
          persistedState.themeState &&
          typeof persistedState.themeState === "object" &&
          "styles" in persistedState.themeState &&
          persistedState.themeState.styles &&
          typeof persistedState.themeState.styles === "object"
        ) {
          normalizeFgColor(
            persistedState.themeState.styles as Record<string, unknown>,
          );
        }

        // Also normalize checkpoint if it exists
        if (
          persistedState &&
          typeof persistedState === "object" &&
          "themeCheckpoint" in persistedState &&
          persistedState.themeCheckpoint &&
          typeof persistedState.themeCheckpoint === "object" &&
          "styles" in persistedState.themeCheckpoint &&
          persistedState.themeCheckpoint.styles &&
          typeof persistedState.themeCheckpoint.styles === "object"
        ) {
          normalizeFgColor(
            persistedState.themeCheckpoint.styles as Record<string, unknown>,
          );
        }

        // Normalize history entries
        if (
          persistedState &&
          typeof persistedState === "object" &&
          "history" in persistedState &&
          Array.isArray(persistedState.history)
        ) {
          persistedState.history.forEach((entry: unknown) => {
            if (
              entry &&
              typeof entry === "object" &&
              "state" in entry &&
              entry.state &&
              typeof entry.state === "object" &&
              "styles" in entry.state &&
              entry.state.styles &&
              typeof entry.state.styles === "object"
            ) {
              normalizeFgColor(entry.state.styles as Record<string, unknown>);
            }
          });
        }

        // Shuffle states keep the look they were applied with
        if (persistedState && typeof persistedState === "object") {
          const persisted = persistedState as Record<string, unknown>;
          const entries = [persisted.history, persisted.future].flatMap(
            (list) => (Array.isArray(list) ? list : []),
          );
          for (const state of [
            persisted.themeState,
            persisted.themeCheckpoint,
            ...entries.map((entry) => (entry as { state?: unknown })?.state),
          ]) {
            freezeShuffleStyles(state);
          }
        }

        // Designs kept from before templates were frames read as their frame
        if (persistedState && typeof persistedState === "object") {
          const persisted = persistedState as Record<string, unknown>;
          for (const key of ["themeState", "themeCheckpoint"] as const) {
            const state = persisted[key];
            if (state && typeof state === "object") {
              persisted[key] = withTemplateFrame(state as ThemeEditorState);
            }
          }
          for (const key of ["history", "future"] as const) {
            const list = persisted[key];
            if (!Array.isArray(list)) continue;
            persisted[key] = list.map((entry: unknown) => {
              const state = (entry as { state?: unknown } | null)?.state;
              return state && typeof state === "object"
                ? {
                    ...(entry as object),
                    state: withTemplateFrame(state as ThemeEditorState),
                  }
                : entry;
            });
          }
        }

        // Merge persisted state with current state, ensuring persisted state takes precedence
        const mergedState = {
          ...currentState,
          ...(persistedState as Partial<QREditorStore>),
        } as QREditorStore;

        // Ensure themeState is properly merged if it exists in persistedState
        if (
          persistedState &&
          typeof persistedState === "object" &&
          "themeState" in persistedState &&
          persistedState.themeState
        ) {
          mergedState.themeState =
            persistedState.themeState as ThemeEditorState;
        }

        return mergedState;
      },
    },
  ),
);
