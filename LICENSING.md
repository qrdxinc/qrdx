# Licensing

Copyright (c) 2025-2026 Ritesh Bucha and QRdx contributors

QRdx is operated by Ritesh Bucha, an individual based in India. In the licensing files, "QRdx" means Ritesh Bucha and any successor or assignee, including any company that operates QRdx now or later.

QRdx is open core. The repository is under three licenses:

- **AGPL-3.0-or-later.** Everything not listed below is licensed under the GNU Affero General Public License, version 3 or (at your option) any later version. Its full text is in [LICENSE](LICENSE). That includes the web app, two-step verification and passkeys.
- **MIT.** The folders that carry their own MIT LICENSE file: packages/qrdx, packages/cli, the plugins in plugins/, the Agent Skill in skills/generate-qr and the shadcn/ui registry components in packages/docs-assets/registry/qrdx.
- **QRdx Commercial License.** The `ee/` folders ([apps/app/ee](apps/app/ee/LICENSE.md) and [packages/auth/ee](packages/auth/ee/LICENSE.md)), each with its own LICENSE.md. They hold business features: workspace single sign-on (OIDC and SAML), the workspace audit log, the client portal and client-branded reports, white-label hosted pages with custom CSS, and conversion tracking. The last three moved there on 15 November 2026; versions published before then keep them under the AGPL for anyone who has those versions. The source is available to read, test and contribute to, but using it in production needs a written agreement with QRdx. A self-hosted instance turns these features on with a license key in `QRDX_EE_LICENSE`; without one they stay off and the rest of QRdx works as usual.

## Getting a commercial agreement

An enterprise agreement covers running the `ee/` features in production on your own server. To get one, use the [enterprise page](https://qrdx.dev/enterprise) or email [enterprise@qrdx.dev](mailto:enterprise@qrdx.dev).

QRdx issues the license key with the agreement. Each key has an expiry date, and the features keep working for 14 days after it so a renewal has time. Your server checks the key offline, against QRdx's public key, without calling QRdx. A value QRdx didn't sign, or a key more than 14 days past its expiry, switches nothing on: the features stay off, as without a key.

## Third-party code

Third-party components in this repository keep the licenses their owners gave them. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) has the license notices for the code that came from next-forge and shadcn/ui.

## Contributions

Outside contributions are accepted under the [QRdx Contributor License Agreement](CLA.md): each one is released under the license of the folder it goes into, and the CLA also lets QRdx license it on other terms, including commercial ones.
