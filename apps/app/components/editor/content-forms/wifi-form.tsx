"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type {
  WifiContent,
  WifiEapMethod,
  WifiPhase2Method,
} from "@/types/qr-content";
import {
  encodeWifi,
  WIFI_EAP_METHODS,
  WIFI_PHASE2_METHODS,
  wifiIssue,
} from "@/utils/qr-content-encoder";

type Encryption = WifiContent["encryption"];

const ENCRYPTIONS: Encryption[] = ["WPA", "SAE", "WPA2-EAP", "WEP", "nopass"];

export function WifiForm() {
  const t = useTranslations("editor.contentForms.wifiForm");
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("wifi") as WifiContent | undefined;
  const [wifiData, setWifiData] = React.useState<Omit<WifiContent, "type">>({
    ssid: storedConfig?.ssid || "",
    password: storedConfig?.password || "",
    encryption: storedConfig?.encryption || "WPA",
    hidden: storedConfig?.hidden || false,
    ...(storedConfig?.encryption === "WPA2-EAP" && {
      eapMethod: storedConfig.eapMethod ?? "PEAP",
      phase2: storedConfig.phase2 ?? "MSCHAPV2",
      identity: storedConfig.identity ?? "",
      anonymousIdentity: storedConfig.anonymousIdentity ?? "",
    }),
  });
  const [touched, setTouched] = React.useState<Set<string>>(() => new Set());

  const encryptionLabels: Record<Encryption, string> = {
    WPA: t("wpaWpa2"),
    SAE: t("wpa3Only"),
    "WPA2-EAP": t("enterprise"),
    WEP: "WEP",
    nopass: t("noPassword"),
  };

  const enterprise = wifiData.encryption === "WPA2-EAP";

  React.useEffect(() => {
    const config: WifiContent = { type: "wifi", ...wifiData };
    const encoded = encodeWifi(config);
    setValue(encoded);
    setContentConfig("wifi", config);
  }, [wifiData, setValue, setContentConfig]);

  const issue = wifiIssue({ type: "wifi", ...wifiData });
  const errorFor = (field: keyof Omit<WifiContent, "type">) => {
    if (issue?.field !== field) return undefined;
    const value = wifiData[field];
    const filled = typeof value === "string" && value !== "";
    return touched.has(field) || filled ? issue.message : undefined;
  };

  const update = (patch: Partial<Omit<WifiContent, "type">>) => {
    setWifiData((current) => ({ ...current, ...patch }));
    setTouched((current) => {
      const next = new Set(current);
      for (const key of Object.keys(patch)) next.add(key);
      return next;
    });
  };

  const changeEncryption = (encryption: Encryption) => {
    setWifiData((current) => {
      const { eapMethod, phase2, identity, anonymousIdentity, ...rest } =
        current;
      return encryption === "WPA2-EAP"
        ? {
            ...rest,
            encryption,
            eapMethod: eapMethod ?? "PEAP",
            phase2: phase2 ?? "MSCHAPV2",
            identity: identity ?? "",
            anonymousIdentity: anonymousIdentity ?? "",
          }
        : { ...rest, encryption };
    });
  };

  const passwordError = errorFor("password");
  const identityError = errorFor("identity");
  const ssidError = errorFor("ssid");

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="wifi-ssid">
          {t("networkName")}
        </Label>
        <Input
          aria-describedby={ssidError ? "wifi-ssid-help" : undefined}
          aria-invalid={Boolean(ssidError)}
          id="wifi-ssid"
          type="text"
          placeholder={t("myWiFiNetwork")}
          value={wifiData.ssid}
          onChange={(e) => update({ ssid: e.target.value })}
        />
        {ssidError && (
          <p className="text-destructive text-[11px]" id="wifi-ssid-help">
            {ssidError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="wifi-encryption">
          {t("security")}
        </Label>
        <Select
          value={wifiData.encryption}
          onValueChange={(value: Encryption) => changeEncryption(value)}
        >
          <SelectTrigger
            aria-describedby={
              wifiData.encryption === "WPA" || wifiData.encryption === "SAE"
                ? "wifi-security-help"
                : undefined
            }
            id="wifi-encryption"
          >
            {/* The label as children, so it's in the server HTML too */}
            <SelectValue>{encryptionLabels[wifiData.encryption]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ENCRYPTIONS.map((encryption) => (
              <SelectItem key={encryption} value={encryption}>
                {encryptionLabels[encryption]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {wifiData.encryption === "WPA" && (
          <p
            className="text-muted-foreground text-[11px] text-pretty"
            id="wifi-security-help"
          >
            {t("wpaHint")}
          </p>
        )}
        {wifiData.encryption === "SAE" && (
          <p
            className="text-muted-foreground text-[11px] text-pretty"
            id="wifi-security-help"
          >
            {t("wpa3Hint")}
          </p>
        )}
      </div>

      {enterprise && (
        <>
          <div className="space-y-2">
            <Label className="text-xs" htmlFor="wifi-eap">
              {t("eapMethod")}
            </Label>
            <Select
              value={wifiData.eapMethod ?? "PEAP"}
              onValueChange={(value: WifiEapMethod) =>
                update({ eapMethod: value })
              }
            >
              <SelectTrigger id="wifi-eap">
                <SelectValue>{wifiData.eapMethod ?? "PEAP"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {WIFI_EAP_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {wifiData.eapMethod !== "PWD" && (
            <div className="space-y-2">
              <Label className="text-xs" htmlFor="wifi-phase2">
                {t("phase2")}
              </Label>
              <Select
                value={wifiData.phase2 ?? "MSCHAPV2"}
                onValueChange={(value: WifiPhase2Method) =>
                  update({ phase2: value })
                }
              >
                <SelectTrigger id="wifi-phase2">
                  <SelectValue>{wifiData.phase2 ?? "MSCHAPV2"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {WIFI_PHASE2_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs" htmlFor="wifi-identity">
              {t("identity")}
            </Label>
            <Input
              aria-describedby={
                identityError ? "wifi-identity-help" : undefined
              }
              aria-invalid={Boolean(identityError)}
              autoComplete="off"
              id="wifi-identity"
              onChange={(e) => update({ identity: e.target.value })}
              placeholder={t("identityPlaceholder")}
              spellCheck={false}
              type="text"
              value={wifiData.identity ?? ""}
            />
            {identityError && (
              <p
                className="text-destructive text-[11px]"
                id="wifi-identity-help"
              >
                {identityError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs" htmlFor="wifi-anonymous">
              {t("anonymousIdentity")}
            </Label>
            <Input
              aria-describedby="wifi-anonymous-help"
              autoComplete="off"
              id="wifi-anonymous"
              onChange={(e) => update({ anonymousIdentity: e.target.value })}
              placeholder="anonymous@example.edu"
              spellCheck={false}
              type="text"
              value={wifiData.anonymousIdentity ?? ""}
            />
            <p
              className="text-muted-foreground text-[11px] text-pretty"
              id="wifi-anonymous-help"
            >
              {t("anonymousIdentityHint")}
            </p>
          </div>
        </>
      )}

      {wifiData.encryption !== "nopass" && (
        <div className="space-y-2">
          <Label className="text-xs" htmlFor="wifi-password">
            {t("password")}
          </Label>
          <Input
            aria-describedby={passwordError ? "wifi-password-help" : undefined}
            aria-invalid={Boolean(passwordError)}
            id="wifi-password"
            type="password"
            placeholder={t("networkPassword")}
            value={wifiData.password}
            onChange={(e) => update({ password: e.target.value })}
          />
          {passwordError && (
            <p className="text-destructive text-[11px]" id="wifi-password-help">
              {passwordError}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50">
        <Label className="cursor-pointer text-xs" htmlFor="wifi-hidden">
          {t("hiddenNetwork")}
        </Label>
        <Switch
          id="wifi-hidden"
          checked={wifiData.hidden}
          onCheckedChange={(checked) =>
            setWifiData({ ...wifiData, hidden: checked })
          }
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {enterprise ? t("enterpriseNote") : t("scanningWillOfferToJoin")}
      </p>
    </div>
  );
}
