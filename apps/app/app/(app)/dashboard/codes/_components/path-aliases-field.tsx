"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Trash } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useState } from "react";
import {
  addPathAlias,
  getPathAliases,
  type PathAliasErrorCode,
  type PathAliasesData,
  removePathAlias,
} from "@/actions/path-aliases";
import {
  PATH_ALIAS_MAX_LENGTH,
  PATH_ALIAS_MAX_SEGMENTS,
  PATH_ALIASES_PER_CODE,
} from "@/lib/path-alias-limits";

// A code's path aliases on its custom domain (lib/path-aliases.ts), in its
// edit dialog: the exact old paths another provider printed on the domain
// (`/r/abc`) that open this code too. Saved right away, apart from the
// dialog's other fields; the dialog sits in a form, so this one has none.

/** Problems with a sentence of their own in the messages. */
const TRANSLATED = [
  "empty",
  "length",
  "segments",
  "characters",
  "backHalf",
  "reserved",
  "otherDomain",
  "taken",
  "hostedPage",
  "limit",
  "unavailable",
] as const satisfies readonly PathAliasErrorCode[];
type TranslatedProblem = (typeof TRANSLATED)[number];

const isTranslated = (code: PathAliasErrorCode): code is TranslatedProblem =>
  (TRANSLATED as readonly string[]).includes(code);

type Loaded =
  | { state: "loading" }
  | { state: "ready"; data: PathAliasesData }
  | { state: "off"; code: PathAliasErrorCode; message: string };

export function PathAliasesField({
  codeId,
  disabled,
}: {
  codeId: string;
  disabled?: boolean;
}) {
  const t = useTranslations("app.dashboard.codes.pathAliases");
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded({ state: "loading" });
    getPathAliases(codeId)
      .then((result) => {
        if (cancelled) return;
        setLoaded(
          result.success
            ? { state: "ready", data: result.data }
            : { state: "off", ...result.error },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded({ state: "off", code: "failed", message: "" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [codeId]);

  // Codes on the default short link have no aliases: nothing to show.
  if (loaded.state === "off" && loaded.code === "noDomain") return null;
  if (loaded.state === "loading") return null;

  const problemText = (code: TranslatedProblem) => {
    switch (code) {
      case "length":
        return t("problems.length", { maxLength: PATH_ALIAS_MAX_LENGTH });
      case "segments":
        return t("problems.segments", { maxSegments: PATH_ALIAS_MAX_SEGMENTS });
      case "limit":
        return t("problems.limit", { max: PATH_ALIASES_PER_CODE });
      default:
        return t(`problems.${code}`);
    }
  };
  const messageFor = (code: PathAliasErrorCode, fallback: string) =>
    isTranslated(code) ? problemText(code) : fallback || t("failed");

  if (loaded.state === "off") {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("title")}</p>
        <p className="text-muted-foreground text-xs">
          {loaded.code === "unavailable"
            ? t("problems.unavailable")
            : t("loadFailed")}
        </p>
      </div>
    );
  }

  const { data } = loaded;
  const { hostname } = data.domain;
  const full = data.aliases.length >= data.max;

  const add = async () => {
    const path = value.trim();
    if (!path || busy) return;
    setBusy(true);
    setError(null);
    const result = await addPathAlias({ codeId, path }).catch(() => null);
    setBusy(false);
    if (!result) {
      setError(t("failed"));
      return;
    }
    if (!result.success) {
      setError(messageFor(result.error.code, result.error.message));
      return;
    }
    setValue("");
    setLoaded({
      state: "ready",
      data: {
        ...data,
        aliases: data.aliases.some((alias) => alias.id === result.data.id)
          ? data.aliases
          : [...data.aliases, result.data],
      },
    });
  };

  const remove = async (aliasId: string) => {
    setBusy(true);
    setError(null);
    const result = await removePathAlias({ codeId, aliasId }).catch(() => null);
    setBusy(false);
    if (!result?.success) {
      setError(
        result
          ? messageFor(result.error.code, result.error.message)
          : t("failed"),
      );
      return;
    }
    setLoaded({
      state: "ready",
      data: {
        ...data,
        aliases: data.aliases.filter((alias) => alias.id !== aliasId),
      },
    });
  };

  // Enter adds the alias instead of saving the whole dialog.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor="code-path-alias">{t("title")}</Label>
      <p className="text-muted-foreground text-xs">
        {t("description", { domain: hostname })}
      </p>
      {data.aliases.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {data.aliases.map((alias) => (
            <li
              className="flex items-center gap-2 py-1 pr-1 pl-3"
              key={alias.id}
            >
              <code className="min-w-0 flex-1 truncate">
                {hostname}
                {alias.path}
              </code>
              <Button
                aria-label={t("remove", { path: alias.path })}
                disabled={disabled || busy}
                onClick={() => remove(alias.id)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash aria-hidden size={16} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {full ? (
        <p className="text-muted-foreground text-xs">
          {t("problems.limit", { max: data.max })}
        </p>
      ) : data.domain.verified ? (
        <div className="flex gap-2">
          <Input
            aria-describedby={error ? "code-path-alias-error" : undefined}
            aria-invalid={Boolean(error)}
            disabled={disabled || busy}
            id="code-path-alias"
            maxLength={PATH_ALIAS_MAX_LENGTH + 100}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={t("placeholder")}
            value={value}
          />
          <Button
            disabled={disabled || busy || !value.trim()}
            onClick={add}
            type="button"
            variant="outline"
          >
            {t("add")}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          {t("verifyFirst", { domain: hostname })}
        </p>
      )}
      {error && (
        <p
          className="text-destructive text-xs"
          id="code-path-alias-error"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
