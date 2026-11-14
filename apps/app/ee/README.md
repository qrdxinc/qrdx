# apps/app/ee

This folder holds the app side of two QRdx business features:

- `audit-log/`: the workspace audit log. It records changes to codes, pages, members, domains, API keys and settings, and has the settings page, filters, CSV export and retention.
- `sso/`: workspace single sign-on. It has the settings page, connection setup and checks, "Require single sign-on" and the sign-in screens.

The server side of single sign-on is in [packages/auth/ee](../../../packages/auth/ee).

## License

The code in this folder is under the [QRdx Commercial License](LICENSE.md), not the AGPL that covers the rest of the app.

- You may read it, and copy and change it to develop, test and evaluate it on non-production systems.
- Using it in production, for real users or real data, needs a written agreement with QRdx and the key QRdx issues with it. That includes a self-hosted server where `QRDX_EE_LICENSE` is set. Each key has an expiry date. Today the app accepts any value in `QRDX_EE_LICENSE`, but that doesn't make production use allowed.
- To get an agreement, use the [enterprise page](https://qrdx.dev/enterprise) or email [enterprise@qrdx.dev](mailto:enterprise@qrdx.dev).

[LICENSING.md](../../../LICENSING.md) explains the licenses of the rest of the repository.
