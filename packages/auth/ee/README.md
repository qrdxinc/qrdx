# packages/auth/ee

This folder holds the server side of workspace single sign-on (OIDC and SAML 2.0), a QRdx business feature:

- `sso.ts`: configures the single sign-on plugin and checks who may sign in through a workspace's connection.
- `sso-required.ts`: enforces "Require single sign-on" at sign-in.
- `sso-rules.ts` and `sso-required-rules.ts`: the shared rules both use, which the app's screens and the tests also read.

The settings and sign-in screens, and the workspace audit log, are in [apps/app/ee](../../../apps/app/ee).

## License

The code in this folder is under the [QRdx Commercial License](LICENSE.md), not the AGPL that covers the rest of the package.

- You may read it, and copy and change it to develop, test and evaluate it on non-production systems.
- Using it in production, for real users or real data, needs a written agreement with QRdx and the key QRdx issues with it. That includes a self-hosted server where `QRDX_EE_LICENSE` is set. Each key has an expiry date. Today the app accepts any value in `QRDX_EE_LICENSE`, but that doesn't make production use allowed.
- To get an agreement, use the [enterprise page](https://qrdx.dev/enterprise) or email [enterprise@qrdx.dev](mailto:enterprise@qrdx.dev).

[LICENSING.md](../../../LICENSING.md) explains the licenses of the rest of the repository.
