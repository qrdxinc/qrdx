# apps/app/ee

This folder holds the app side of the QRdx business features:

- `audit-log/`: the workspace audit log. It records changes to codes, pages, members, domains, API keys and settings, and has the settings page, filters, CSV export and retention.
- `sso/`: workspace single sign-on. It has the settings page, connection setup and checks, "Require single sign-on" and the sign-in screens.
- `client-portal/`: the client portal and client reports. It has client brands, client-branded shared stats pages (and their link on a custom domain), the read-only portal at `/portal/<workspace>`, its invitations and its settings page.
- `white-label/`: white-label hosted pages and custom CSS. It decides whether a page drops QRdx's branding and applies its CSS, checks and scopes the CSS, and has the editor's controls for both.
- `conversions/`: conversion tracking. It has `POST /api/v1/conversions`, the `/conversions.js` browser script, the tracking switch and snippets, and the conversion cards in analytics.

Each one is on only where the server has the license key (`QRDX_EE_LICENSE`), and, where plans are sold, for workspaces whose plan includes it. The AGPL app reaches them through a few entry points (route files, each feature's `access.ts` and some components), listed in `apps/app/tests/ee/ee-seam.test.ts`. Without the key they're absent and the rest of the app works as usual: hosted pages show QRdx's default branding, shared stats pages show no client brand, and scans carry no conversion id.

The server side of single sign-on is in [packages/auth/ee](../../../packages/auth/ee).

## License

The code in this folder is under the [QRdx Commercial License](LICENSE.md), not the AGPL that covers the rest of the app.

- You may read it, and copy and change it to develop, test and evaluate it on non-production systems.
- Using it in production, for real users or real data, needs a written agreement with QRdx. That includes a self-hosted server where `QRDX_EE_LICENSE` is set.
- QRdx issues the license key with the agreement. It has an expiry, with 14 days' grace after it, and the server checks it offline against QRdx's public key: a value QRdx didn't sign, or a key past its grace period, switches nothing on. **Admin** → **Health** shows when it expires.
- To get an agreement, use the [enterprise page](https://qrdx.dev/enterprise) or email [enterprise@qrdx.dev](mailto:enterprise@qrdx.dev).

[LICENSING.md](../../../LICENSING.md) explains the licenses of the rest of the repository.
