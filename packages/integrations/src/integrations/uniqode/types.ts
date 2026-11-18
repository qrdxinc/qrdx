/**
 * Uniqode API 2.0 shapes QRdx reads (https://apidocs.uniqode.com). Only the
 * fields the reference documents; every one is optional because QRdx has no
 * Uniqode account to check a live response against.
 */

export interface UniqodeCampaign {
  id?: number;
  name?: string;
  /** Campaign type: 1 = Custom URL (a website) */
  content_type?: number;
  /** Where a Custom URL code sends people */
  custom_url?: string | null;
}

export interface UniqodeQrCode {
  id: number;
  name?: string;
  /** 1 = static, 2 = dynamic */
  qr_type?: number;
  organization?: number;
  /** "URL of the QR Code": the address the printed code opens */
  url?: string | null;
  /** A = active, S = sleeping (deactivated) */
  state?: string;
  /** "Tag data associated with attached tag IDs" */
  tag_data?: Array<{ id?: number; name?: unknown }> | null;
  campaign?: UniqodeCampaign | null;
  created?: string | number | null;
  updated?: string | number | null;
}

/** GET /qrcodes/: a paginated list (count, next, previous, results). */
export interface UniqodeQrCodeList {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: UniqodeQrCode[];
}

/** Saved in the integration row's metadata. */
export interface UniqodeMetadata {
  /** Dynamic website codes in the account when it was connected */
  codeCount?: number;
}
