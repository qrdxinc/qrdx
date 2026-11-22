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
import { useTranslations } from "next-intl";
import * as React from "react";
import type { EthereumFormData } from "@/lib/validations/qr-content";
import { ethereumSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { EthereumContent } from "@/types/qr-content";
import { EVM_NETWORKS, evmNetwork } from "@/utils/crypto-payments";
import { encodeEthereum } from "@/utils/qr-content-encoder";

export function EthereumForm() {
  const t = useTranslations("editor.contentForms.ethereumForm");
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("ethereum") as
    | EthereumContent
    | undefined;
  const [ethereumData, setEthereumData] = React.useState<EthereumFormData>({
    address: storedConfig?.address || "",
    amount: storedConfig?.amount || "",
    gas: storedConfig?.gas || "",
    // Added 2026-11-22 (payments)
    network: storedConfig?.network || "1",
    token: storedConfig?.token,
  });
  const network = evmNetwork(ethereumData.network) ?? EVM_NETWORKS[0];
  const coins = [
    { value: "native", label: network?.coin ?? "ETH" },
    ...(["USDT", "USDC"] as const)
      .filter((token) => network?.tokens[token])
      .map((token) => ({ value: token, label: token })),
  ];
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = ethereumSchema.safeParse(ethereumData);

    if (result.success) {
      const config: EthereumContent = { type: "ethereum", ...result.data };
      const encoded = encodeEthereum(config);
      setValue(encoded);
      setContentConfig("ethereum", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [ethereumData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label className="text-xs" htmlFor="ethereum-network">
            {t("network")}
          </Label>
          <Select
            onValueChange={(next) => {
              const chosen = evmNetwork(next);
              setEthereumData({
                ...ethereumData,
                network: next,
                // A stablecoin its issuer doesn't list on the new network
                // falls back to the network's own coin.
                token:
                  ethereumData.token && chosen?.tokens[ethereumData.token]
                    ? ethereumData.token
                    : undefined,
              });
            }}
            value={network?.chainId ?? "1"}
          >
            <SelectTrigger className="w-full" id="ethereum-network">
              <SelectValue>{network?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {EVM_NETWORKS.map((item) => (
                <SelectItem key={item.chainId} value={item.chainId}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs" htmlFor="ethereum-coin">
            {t("coin")}
          </Label>
          <Select
            onValueChange={(next) =>
              setEthereumData({
                ...ethereumData,
                token:
                  next === "native" ? undefined : (next as "USDT" | "USDC"),
              })
            }
            value={ethereumData.token ?? "native"}
          >
            <SelectTrigger className="w-full" id="ethereum-coin">
              <SelectValue>
                {
                  coins.find(
                    (coin) => coin.value === (ethereumData.token ?? "native"),
                  )?.label
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {coins.map((coin) => (
                <SelectItem key={coin.value} value={coin.value}>
                  {coin.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {ethereumData.token && (
        <p className="text-muted-foreground text-[11px] text-pretty">
          {t("tokenNote", {
            token: ethereumData.token,
            network: network?.name ?? "",
          })}
        </p>
      )}
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="ethereum-address">
          {t("ethereumAddress")}
        </Label>
        <Input
          id="ethereum-address"
          type="text"
          placeholder={t("n0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359")}
          value={ethereumData.address}
          onChange={(e) =>
            setEthereumData({ ...ethereumData, address: e.target.value })
          }
          className={errors.address ? "border-destructive" : ""}
        />
        {errors.address && (
          <p className="text-destructive text-[11px]">{errors.address}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="ethereum-amount">
          {ethereumData.token || (network?.coin ?? "ETH") !== "ETH"
            ? t("amountIn", {
                coin: ethereumData.token ?? network?.coin ?? "ETH",
              })
            : t("amountEth")}
        </Label>
        <Input
          id="ethereum-amount"
          type="text"
          placeholder="0.1"
          value={ethereumData.amount}
          onChange={(e) =>
            setEthereumData({ ...ethereumData, amount: e.target.value })
          }
          className={errors.amount ? "border-destructive" : ""}
        />
        {errors.amount && (
          <p className="text-destructive text-[11px]">{errors.amount}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="ethereum-gas">
          {t("gasLimit")}
        </Label>
        <Input
          id="ethereum-gas"
          type="text"
          placeholder="21000"
          value={ethereumData.gas}
          onChange={(e) =>
            setEthereumData({ ...ethereumData, gas: e.target.value })
          }
          className={errors.gas ? "border-destructive" : ""}
        />
        {errors.gas && (
          <p className="text-destructive text-[11px]">{errors.gas}</p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        {t("scanningWillOpenAnEthereum")}
      </p>
    </div>
  );
}
