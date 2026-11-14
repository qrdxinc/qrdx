# packages/auth/ee

This folder holds the server side of workspace single sign-on (OIDC and SAML 2.0), a QRdx business feature, and the check of the license key that switches the business features on:

- `sso.ts`: configures the single sign-on plugin and checks who may sign in through a workspace's connection.
- `sso-required.ts`: enforces "Require single sign-on" at sign-in.
- `sso-rules.ts` and `sso-required-rules.ts`: the shared rules both use, which the app's screens and the tests also read.
- `license.ts`: checks the license key (`QRDX_EE_LICENSE`) offline: its Ed25519 signature, against the public key in `license-public-key.ts`, and its expiry, with 14 days' grace.
- `scripts/license.mjs`: QRdx's tool for making the key pair and issuing keys. The private key never enters this repository.

The settings and sign-in screens, and the workspace audit log, are in [apps/app/ee](../../../apps/app/ee).

## License

The code in this folder is under the [QRdx Commercial License](LICENSE.md), not the AGPL that covers the rest of the package.

- You may read it, and copy and change it to develop, test and evaluate it on non-production systems.
- Using it in production, for real users or real data, needs a written agreement with QRdx. That includes a self-hosted server where `QRDX_EE_LICENSE` is set.
- QRdx issues the license key with the agreement. It has an expiry, and the server checks it offline against QRdx's public key: a value QRdx didn't sign, or a key more than 14 days past its expiry, switches nothing on. **Admin** → **Health** shows when it expires.
- To get an agreement, use the [enterprise page](https://qrdx.dev/enterprise) or email [enterprise@qrdx.dev](mailto:enterprise@qrdx.dev).

[LICENSING.md](../../../LICENSING.md) explains the licenses of the rest of the repository.
