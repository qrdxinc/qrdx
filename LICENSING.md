# Licensing

Copyright (c) 2025-2026 Ritesh Bucha and QRdx contributors

QRdx is operated by Ritesh Bucha, an individual based in India. In the licensing files, "QRdx" means Ritesh Bucha and any successor or assignee, including any company that operates QRdx now or later.

QRdx is open core. The repository is under three licenses:

- **AGPL-3.0-or-later.** Everything not listed below is licensed under the GNU Affero General Public License, version 3 or (at your option) any later version. Its full text is in [LICENSE](LICENSE). That includes the web app, two-step verification and passkeys.
- **MIT.** The folders that carry their own MIT LICENSE file: packages/qrdx, packages/cli, the plugins in plugins/, the Agent Skill in skills/generate-qr and the shadcn/ui registry components in packages/docs-assets/registry/qrdx.
- **QRdx Commercial License.** The `ee/` folders ([apps/app/ee](apps/app/ee/LICENSE.md) and [packages/auth/ee](packages/auth/ee/LICENSE.md)), each with its own LICENSE.md. They hold business features; today that's workspace single sign-on (OIDC and SAML) and the workspace audit log. The source is available to read, test and contribute to, but using it in production needs a written agreement with QRdx. A self-hosted instance turns these features on with a license key in `QRDX_EE_LICENSE`; without one they stay off and the rest of QRdx works as usual.

## Getting a commercial agreement

An enterprise agreement covers running the `ee/` features in production on your own server. To get one, use the [enterprise page](https://qrdx.dev/enterprise) or email [enterprise@qrdx.dev](mailto:enterprise@qrdx.dev).

QRdx issues the license key with the agreement, and each key has an expiry date. The app doesn't check the key today: any value in `QRDX_EE_LICENSE` switches the features on. The agreement, not the key, is what lets you use them in production, and using a key QRdx didn't issue in production breaks the license.

## Third-party code

Third-party components in this repository keep the licenses their owners gave them. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) has the license notices for the code that came from next-forge and shadcn/ui.

## Contributions

Outside contributions are accepted under the [QRdx Contributor License Agreement](CLA.md): each one is released under the license of the folder it goes into, and the CLA also lets QRdx license it on other terms, including commercial ones.
