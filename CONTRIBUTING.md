# Contributing to Confidential PoolTogether

Thanks for helping improve Confidential PoolTogether. Contributions that strengthen privacy, safety, usability, documentation, and test coverage are welcome.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Open an issue before a large architectural change so the approach can be discussed first.
- Report security vulnerabilities through the private process in [SECURITY.md](SECURITY.md), not a public issue.
- Never commit private keys, wallet seed phrases, service-role keys, or privileged RPC credentials.

## Local setup

You need Node.js 20 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Only add the environment variables required for the workflow you are testing. Variables prefixed with `VITE_` are compiled into the browser bundle and must not contain secrets.

## Development checks

Run the checks relevant to your change:

```bash
npm run lint
npm test
npm run build
npm run contracts:test
```

For user-interface or wallet-flow changes, also run:

```bash
npm run browser:smoke
```

The browser smoke test uses live Sepolia services and may require the RPC variables documented in the [README](README.md#development).

## Pull requests

Keep each pull request focused and explain:

- What changed and why.
- How the change was tested.
- Any contract, deployment, privacy, or migration impact.
- Screenshots or recordings for visible interface changes.

Update documentation, generated deployment manifests, and tests when behavior changes. Avoid unrelated formatting or refactoring in the same pull request.

## Commit style

Use a short, imperative summary. Conventional prefixes such as `feat:`, `fix:`, `docs:`, `test:`, and `chore:` are encouraged.
