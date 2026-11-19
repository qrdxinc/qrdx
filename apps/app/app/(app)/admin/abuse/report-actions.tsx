"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useTransition } from "react";
import { toast } from "sonner";
import type { AdminActionResult } from "../actions";
import {
  blockReportedFileAction,
  disableReportedCodeAction,
  restoreReportedCodeAction,
  setAbuseReportStatusAction,
} from "./actions";

interface ReportActionsProps {
  reportId: string;
  status: string;
  /** `moderated`: off after a review, so turning it on is an override */
  code: { slug: string; isActive: boolean; moderated: boolean } | null;
  files: { id: string; filename: string; blocked: boolean }[];
}

export function ReportActions({
  reportId,
  status,
  code,
  files,
}: ReportActionsProps) {
  const [isPending, startTransition] = useTransition();

  const perform = (
    action: () => Promise<AdminActionResult>,
    success: string,
  ) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error);
    });
  };

  const askReason = (question: string) => {
    const answer = window.prompt(`${question} Reason (optional):`);
    return answer === null ? null : answer || undefined;
  };

  const onDisable = () => {
    if (!code) return;
    const reason = askReason(
      `Disable /q/${code.slug}? Scans will show a "no longer active" page and the owner cannot re-enable it. Every open report about it is resolved.`,
    );
    if (reason === null) return;
    perform(
      () => disableReportedCodeAction({ reportId, reason }),
      `Disabled /q/${code.slug}`,
    );
  };

  const onRestore = () => {
    if (!code) return;
    if (code.moderated) {
      const reason = window.prompt(
        `QRdx switched /q/${code.slug} off after a review (an actioned report or an admin's Disable). Turn it back on anyway and dismiss this report? Reason (required):`,
      );
      if (reason === null) return;
      perform(
        () => restoreReportedCodeAction({ reportId, reason, override: true }),
        `Enabled /q/${code.slug}`,
      );
      return;
    }
    const reason = askReason(
      `Turn /q/${code.slug} back on and dismiss this report?`,
    );
    if (reason === null) return;
    perform(
      () => restoreReportedCodeAction({ reportId, reason }),
      `Enabled /q/${code.slug}`,
    );
  };

  const onBlockFile = (file: { id: string; filename: string }) => {
    const reason = askReason(
      `Block "${file.filename}"? Pages using it show "file unavailable" and re-uploads of the same file are rejected.`,
    );
    if (reason === null) return;
    perform(
      () => blockReportedFileAction({ reportId, fileId: file.id, reason }),
      `Blocked ${file.filename}`,
    );
  };

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {code &&
        (code.isActive ? (
          <Button
            disabled={isPending}
            onClick={onDisable}
            size="sm"
            variant="destructive"
          >
            Disable code
          </Button>
        ) : (
          <Button
            disabled={isPending}
            onClick={onRestore}
            size="sm"
            variant="outline"
          >
            {code.moderated
              ? "Enable anyway"
              : status === "open"
                ? "Approve & enable"
                : "Enable code"}
          </Button>
        ))}
      {files
        .filter((file) => !file.blocked)
        .map((file) => (
          <Button
            disabled={isPending}
            key={file.id}
            onClick={() => onBlockFile(file)}
            size="sm"
            title={file.filename}
            variant="outline"
          >
            Block file
            <span className="max-w-[120px] truncate font-normal">
              {file.filename}
            </span>
          </Button>
        ))}
      {status === "open" ? (
        <>
          <Button
            disabled={isPending}
            onClick={() =>
              perform(
                () =>
                  setAbuseReportStatusAction({ reportId, status: "actioned" }),
                "Report resolved",
              )
            }
            size="sm"
            variant="ghost"
          >
            Mark resolved
          </Button>
          <Button
            disabled={isPending}
            onClick={() =>
              perform(
                () =>
                  setAbuseReportStatusAction({ reportId, status: "dismissed" }),
                "Report dismissed",
              )
            }
            size="sm"
            variant="ghost"
          >
            Dismiss
          </Button>
        </>
      ) : (
        <Button
          disabled={isPending}
          onClick={() =>
            perform(
              () => setAbuseReportStatusAction({ reportId, status: "open" }),
              "Report reopened",
            )
          }
          size="sm"
          variant="ghost"
        >
          Reopen
        </Button>
      )}
    </div>
  );
}
