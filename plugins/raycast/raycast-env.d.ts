/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** QRdx API Key - Only for the dynamic-code commands and AI tools. Create a key in QRdx under Settings → API keys & apps; every plan has them. */
  "apiKey"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `generate-qr` command */
  export type GenerateQr = ExtensionPreferences & {}
  /** Preferences accessible in the `saved-qrs` command */
  export type SavedQrs = ExtensionPreferences & {}
  /** Preferences accessible in the `ai-generate` command */
  export type AiGenerate = ExtensionPreferences & {}
  /** Preferences accessible in the `dynamic-codes` command */
  export type DynamicCodes = ExtensionPreferences & {}
  /** Preferences accessible in the `create-dynamic-code` command */
  export type CreateDynamicCode = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `generate-qr` command */
  export type GenerateQr = {}
  /** Arguments passed to the `saved-qrs` command */
  export type SavedQrs = {}
  /** Arguments passed to the `ai-generate` command */
  export type AiGenerate = {}
  /** Arguments passed to the `dynamic-codes` command */
  export type DynamicCodes = {}
  /** Arguments passed to the `create-dynamic-code` command */
  export type CreateDynamicCode = {}
}

