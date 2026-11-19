# email

The preview server for QRdx's emails (React Email). It shows every template in `packages/email/templates` that has `PreviewProps`, in English, rendered with those props.

```bash
bun run --filter email dev      # http://localhost:3003
bun run --filter email export   # every template's HTML in out/
```

No environment, database or Resend key is needed, and nothing is sent. Links in the emails point at http://localhost:3000.

Before each run, `scripts/prepare.mjs` writes `emails/` (not committed): one file per template that renders it in English, and `messages.json`, a copy of the `emails` namespace of `apps/app/messages/en.json` that `english.ts` reads. Restart the server after adding a template or changing that copy.

It isn't deployed and isn't part of the pre-push hook, CI, Vercel's build or the root `bun run dev` (`--filter=!email`). There's no `email build`: it installs the preview UI's own pinned Next.js with npm (the root `@react-email/ui>next` override doesn't reach it), and that build refuses to finish on a security advisory for that version. `dev` runs on the app's Next.js through the override.
