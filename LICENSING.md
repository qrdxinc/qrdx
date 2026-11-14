# Licensing

Copyright (c) 2025-2026 Ritesh Bucha and QRdx contributors

QRdx is operated by Ritesh Bucha, an individual based in India. In the licensing files, "QRdx" means Ritesh Bucha and any successor or assignee, including any company that operates QRdx now or later.

QRdx is open core. The repository is under three licenses:

- **AGPL-3.0-or-later.** Everything not listed below is licensed under the GNU Affero General Public License, version 3 or (at your option) any later version. Its full text is in [LICENSE](LICENSE). That includes the web app, two-step verification and passkeys.
- **MIT.** The folders that carry their own MIT LICENSE file: packages/qrdx, packages/cli, the plugins in plugins/, the Agent Skill in skills/generate-qr and the shadcn/ui registry components in packages/docs-assets/registry/qrdx.
- **QRdx Commercial License.** The `ee/` folders ([apps/app/ee](apps/app/ee/LICENSE.md) and [packages/auth/ee](packages/auth/ee/LICENSE.md)), each with its own LICENSE.md. They hold business features; today that's workspace single sign-on (OIDC and SAML) and the workspace audit log. The source is available to read, test and contribute to, but using it in production needs a written agreement with QRdx. A self-hosted instance turns these features on with a license key in `QRDX_EE_LICENSE`; without one they stay off and the rest of QRdx works as usual.

## Getting a commercial agreement

An enterprise agreement covers running the `ee/` features in production on your own server. To get one, use the [enterprise page](https://qrdx.dev/enterprise) or email [enterprise@qrdx.dev](mailto:enterprise@qrdx.dev).

QRdx issues the license key with the agreement, and each key has an expiry date. Production use needs the agreement and that key. Today the app accepts any value in `QRDX_EE_LICENSE`, but that doesn't make production use allowed.

## Earlier versions

Moving code into an `ee/` folder changes the license of later versions only. Code that was published under the AGPL keeps the AGPL's terms in the versions where it was published, for anyone who has them.

- **Workspace single sign-on** was in AGPL-licensed files before it moved into `ee/`. The sign-on plugin and its database tables went in on 5 November 2026 at 17:42 IST (commit `b869f6e1`), and QRdx's own sign-on code from 23:27 IST (`79510a38` and `cfbd01f1`). It reached the `staging` branch on 6 November at 04:25 IST (pull request #232). It moved into `ee/` on 6 November at 05:10 IST (`daa03f6a`), and the move reached `staging` at 12:44 IST (#243). It arrived on `main` already in `ee/` (#237, 6 November, 13:01 IST). No tagged release has it outside `ee/`: v0.2.0 is older, and v0.2.1 has it in `ee/`. The commits before the move stay in the repository's history under the AGPL. Its database tables and the line that registers the plugin are still in AGPL files.
- **The workspace audit log** has been in `ee/` since its first commit (`7ab9ef4a`, 9 November 2026). Only its database table, the calls that record events, and the route files that load it are outside `ee/`, under the AGPL like the rest of the app. The admin panel's audit log at `/admin` is a different feature and stays AGPL.

## Third-party code

Third-party components in this repository keep the licenses their owners gave them. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) has the license notices for the code that came from next-forge and shadcn/ui.

## Contributions

Outside contributions are accepted under the [QRdx Contributor License Agreement](CLA.md): each one is released under the license of the folder it goes into, and the CLA also lets QRdx license it on other terms, including commercial ones.
