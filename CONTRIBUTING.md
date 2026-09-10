# Contributing to paperless-mcp

Thank you for your interest in contributing!

## How to Contribute
- Fork the repository
- Create a new branch for your feature or bugfix
- Make your changes
- Open a pull request with a clear description

## Scope of a Pull Request

A pull request should make **one** behavior change, and its diff should contain only what that change needs.

- **Agree on the change before writing it.** Open an issue, or comment on an existing one, and wait for a maintainer's go-ahead. An unsolicited pull request that adds a feature, a flag, or hardening is likely to be closed regardless of how good the code is.
- **Do not add public surface that was not asked for.** New CLI flags, environment variables, `manifest.json` config fields, and HTTP endpoints have to be agreed in an issue first. Once released they are permanent and have to be supported.
- **Do not change existing defaults.** Changing a default — a bind address, a timeout, an API version — breaks someone's setup. It needs its own pull request and its own discussion, even when the new value is safer.
- **Keep hardening, refactoring, and cleanup out of a feature pull request.** If you notice an unrelated problem while working, say so in the description or open an issue. Do not fix it in the same diff.
- **Match the size of the change to the size of the problem.** A ten-line feature should not arrive wrapped in several hundred lines of defensive code. Handle the cases that can actually occur.

## AI-Assisted Contributions

AI-assisted contributions are welcome. They must be coordinated, scoped, and verified, so that reviewing the result costs less than producing it did.

- **You are the author.** You are accountable for every line, whether or not a tool wrote it — for its correctness, its licensing, and the fact that someone has to maintain it.
- **You must be able to explain the change in your own words.** If you cannot say why a line is there, delete it and submit the part you can explain.
- **Read every changed line before opening the pull request.** Remove what the tool added that the change did not need: comments restating the code, comments arguing the case for the change, tests that assert nothing, abstractions with a single caller, and code paths for states that cannot occur.
- **Verify it against a real Paperless-NGX instance** and say in the description what you ran and what you saw.
- **Disclose the assistance in the description,** together with a link to the issue where the change was agreed.

The scope rules above matter most here. A large, plausible-looking diff is cheap to generate, and the cost of reading it lands on someone else.

## Reporting Issues
- Please use GitHub Issues for bug reports and feature requests
- Include as much detail as possible

## Code Style
- Use TypeScript for all new code
- Follow existing code patterns
- Write comments that explain *why*. If the code already says it, leave the comment out.
- Keep comments and identifiers in English
- Every code change needs a changeset: run `npx changeset` and commit the generated file
