# Security Policy

## Supported versions

Security fixes are applied to the latest commit on `main`. Earlier commits, historical Sepolia deployments, and unpublished branches are not supported.

Confidential PoolTogether is an unaudited testnet prototype. It must not be used to custody production funds.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Email `hellodaries@gmail.com` with the subject `Confidential PoolTogether security report`. Include:

- A description of the issue and its potential impact.
- The affected component, contract address, commit, or deployment.
- Reproduction steps or a minimal proof of concept.
- Any suggested remediation or disclosure timeline.

Never include private keys, seed phrases, or credentials in a report. Use a fresh test wallet and Sepolia-only funds when demonstrating an issue.

You should receive an acknowledgement within five business days. Please allow the maintainers a reasonable opportunity to investigate and release a fix before public disclosure.

## Good-faith research

Good-faith research should avoid privacy violations, disruption, social engineering, automated abuse of third-party infrastructure, and access to data or assets that do not belong to the researcher. Stop testing and report immediately if you encounter sensitive data or unintended access.

Known product limitations documented in the [README](README.md#security-notes) are not vulnerabilities by themselves, but reports showing a greater impact are welcome.
