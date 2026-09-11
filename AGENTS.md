# AGENTS.md

Instructions for AI coding agents working in this repository. Human contributors should read [CONTRIBUTING.md](CONTRIBUTING.md).

This project is a Model Context Protocol (MCP) server for the Paperless-NGX API, written in TypeScript for Node.

## Before writing code

The change must already be agreed in a GitHub issue. If the person directing you has not linked one, stop and ask them to open one first. Do not open a pull request for a change nobody asked for.

## Scope

- One behavior change per pull request. Nothing in the diff that the change does not need.
- Do not add CLI flags, environment variables, `manifest.json` fields, or HTTP endpoints unless the issue asks for them.
- Do not change an existing default. That breaks someone's setup and needs its own discussion.
- Do not add hardening, refactoring, or cleanup alongside a feature. Report what you noticed instead of fixing it here.
- Size the change to the problem. No defensive code for states that cannot occur, no abstraction with a single caller, no configuration nobody requested, no duplicate enforcement of the same rule at two layers.

## Comments

Write none by default. A comment must carry what the code cannot: a hidden constraint, a non-obvious *why*, a reference. Never restate the line below it, and never argue the case for your own change — that belongs in the pull request description.

Keep comments and identifiers in English.

## Required

- A changeset for every **code** change: run `npx changeset` and commit the generated `.changeset/*.md`. Documentation-only changes do not take one — a changeset triggers a release.
- No scratch, planning, or summary files (`NOTES.md`, `PLAN.md`, `REVIEW_SUMMARY.md`, and the like). No build artifacts, `node_modules`, or `.env` files.
- No new top-level documentation or governance files unless you were asked for them.
- In code, comments, and config: no references to another repository, or to the setup of whoever is running you. Deliberate attribution in this project's own documentation is fine.

## Accountability

The human who opens the pull request is its author and answers for every line of it. Leave a diff they can read end to end and explain in their own words. If you cannot justify a line to them, remove it.

## Full project conventions

`CLAUDE.md` holds this project's complete conventions — architecture, tool registration patterns, API typing rules, transport modes, and testing. Read it before making changes.
