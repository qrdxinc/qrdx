# Security policy

This folder is the QRdx agent plugin: the `generate-qr` skill and the connection to the QRdx MCP server. It follows the security policy of the QRdx repository, [SECURITY.md](../../SECURITY.md).

## Reporting a vulnerability

Please don't report security vulnerabilities in public GitHub issues, discussions or pull requests. Email **[support@qrdx.dev](mailto:support@qrdx.dev)** with the subject line starting with `[security]`, and say which part is affected: the skill, the MCP server at `https://mcp.qrdx.dev/mcp`, or the `@qrdx/cli` package the skill runs.

## Supported versions

Security fixes are made for:

- the latest version of this plugin (the `version` in [plugin.json](plugin.json))
- the hosted MCP server at `https://mcp.qrdx.dev/mcp`
- the latest published version of [`@qrdx/cli`](https://www.npmjs.com/package/@qrdx/cli)
