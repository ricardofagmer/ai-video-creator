---
name: desktop-installer
status: accepted
owner: Ricardo Fagmer
---

# Desktop installer and hosted portal

Amends PRD 0001 (`docs/prds/0001-video-studio.md`) section 11 (install) and section 12
("local-only", "single Mac"). Decisions in ADR 0010. Source revision read: `0060c10`.

## Problem

Installing EngineOS Video Creator means cloning the repository and running
`scripts/install.sh` in Terminal: 15 steps that need Homebrew, Node 22, pnpm, a full
workspace build and a terminal that answers questions (**Fact**, `scripts/install.sh`).
The owner (2026-11-23) called this approach not good and asked for a downloaded installer
for macOS and for Windows, with the web aware of the install and in sync with the computer.

Today the product also cannot run on Windows at all: the watcher is a launchd agent, the
keys live in the macOS Keychain, and ffmpeg comes from Homebrew (**Fact**, ADR 0005,
`apps/watcher/launchd/`).

## Goal & success metrics

1. A person installs the studio by downloading one file and opening it. No Terminal, no
   Homebrew, no repository clone.
2. A hosted page shows, for the computer it is opened on, whether the studio is installed,
   which version, and whether each part is healthy.
3. Windows gets the same experience in a second phase.

Measures:

- Zero Terminal commands between "download" and "studio open in the browser".
- The portal shows the correct state within 5 seconds of opening, in the three cases: not
  installed, installed and healthy, installed with a problem.
- An update published as a release shows as "update available" on the portal without any
  change on the computer.

## Users & use cases

One user: the owner, on their own computers (Mac now, a Windows PC in phase 2).

- **Install**: open the portal, download the installer for this OS, open it, follow the
  first-run setup (passphrase, optional downloads), land in the studio.
- **Check**: open the portal later and see version, watcher, ffmpeg, search model, data
  folder and update status at a glance.
- **Update**: see "update available", download the new installer, open it; data is kept.
- **Remove**: uninstall from the app; data is kept unless the owner asks to delete it.

## Requirements

Owner decisions of 2026-11-23 are marked **(D)**.

| Id | Requirement |
|---|---|
| R1 | The Mac installer is a `.dmg` holding one self-contained app: it carries its own Node runtime, ffmpeg and ffprobe, and the built api, web, watcher and CLI. It needs no Homebrew, pnpm or source checkout. |
| R2 | On first open the app runs a setup that replaces `install.sh` steps 6 to 15: data folders (mode 700), database migrations, passphrase, watcher registration at login, seed catalog, start of web and api, and a health check. Every step is safe to repeat. |
| R3 | The optional downloads stay optional and ask first: the search model and the Playwright browser. Each names its host and size before downloading. A refusal or failure leaves the rest of the studio working. |
| R4 | The installers are not code-signed with a paid certificate in this delivery **(D)**. The Mac app is signed ad hoc. The portal explains the Gatekeeper step the user must take on first open. |
| R5 | A hosted portal (Vercel) **(D)** offers the installer downloads and shows install status. It holds no account, no database and no server-side user data. |
| R6 | The portal learns the computer's state by calling the local api on `127.0.0.1` from the browser **(D)**. Nothing about the computer is sent to the portal's server. |
| R7 | Detailed status is released only to a portal that was paired with this computer through a one-time code issued by the desktop app. An unpaired page learns only that the product is present and its version. |
| R8 | Status covers: installed version, api, web, watcher, ffmpeg, search model, Playwright browser, data folder, and whether a newer release exists **(D: "status and health")**. No file path, user name, catalog content or key is in the payload. |
| R9 | The local api still listens on `127.0.0.1` only. The portal origin is the single cross-origin caller it accepts, on the install-status routes only. |
| R10 | Installers are built by CI on a version tag and published as GitHub Releases with a SHA-256 for each file and a `latest.json` manifest **(D)**. The portal shows the checksum. |
| R11 | There is no silent auto-update. The portal and the app's menu say when a newer release exists and link to the download. |
| R12 | Installing a newer version over an older one keeps the data folder, the passphrase and the keys. |
| R13 | The app can remove what it registered (watcher agent, login item, itself) and, only on explicit request, the data folder. |
| R14 | Phase 2 delivers a Windows installer with the same first-run setup and the same status contract. It ships only after verification on a real Windows machine. |
| R15 | `scripts/install.sh` remains for development from a source checkout. It is no longer the documented way to install. |

## Non-goals

- Hosting the studio itself. Catalog, runs and every studio page stay served from the
  computer **(D: "download + status portal")**.
- Accounts, multi-user, a cloud database or a relay server.
- Syncing files, catalog entries or settings between computers.
- Paid code signing, notarization and Windows SmartScreen reputation (revisit trigger in ADR 0010).
- Intel Macs (SPEC 0002 A18 stands).
- Automatic background updates.
- Status from a phone or from another computer: the portal reads only the computer it is
  opened on.

## Open questions

| # | Question | Owner | Blocks |
|---|---|---|---|
| Q1 | Is `ricardofagmer/ai-video-creator` public? A private repository cannot serve public release downloads; the alternative is a small public releases repository. | answered 2026-11-23: the owner says it is public; releases attach to this repository | none |
| Q2 | Which Vercel project and domain host the portal? The domain becomes the one allowed origin (R9). | answered 2026-11-23: decided at deploy time; the origin is configuration with no default | none |
| Q3 | **Unverified**: Chrome's local network access permission and Safari's handling of `http://127.0.0.1` from an HTTPS page. To be confirmed against vendor documentation in the vetting report before ticket 06 freezes its fallback copy. | answered 2026-11-23 by vetting 0006: Chrome, Edge and Firefox allow it after a permission prompt; Safari blocks it | none |
| Q4 | Which Windows machine or VM verifies phase 2? | owner | phase 2 |
