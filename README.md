# Triviall

Party games for a TV and everyone's phones. The TV shows what is public, each phone shows what is private, and the host runs the room from a third screen.

This first slice ships two games, **Trivia** (Open Trivia Database, 20 questions by default) and **Werewolves**, plus a shared UI kit and a lab for reviewing them. It is a static site, so GitHub Pages can host it as is.

## Review it

```
make serve        # then open http://localhost:8080/lab/
make check        # tests plus a site link and import check
```

Needs Node 20+, Python 3, and make. Nothing to install.

- `index.html` is the landing page, with a live demo.
- `lab/` shows the display, host, and phone views side by side, with the raw payload each role receives and a check that flags any secret field on the display.
- `docs/` is the docs site: quickstart, game contract, how to add a game, roadmap, and the verification spike.

## Publish on GitHub Pages

Settings, Pages, Deploy from a branch, your default branch, `/ (root)`. There is no build step. Links are relative, so a project path like `/triviall/` works.

## What is real

Real and tested: game rules, scoring, role assignment, timers, per-role views, leak checks, and the Open Trivia Database client (against stubbed responses).

Not built yet: the realtime server, Codespaces startup, QR joining from real phones, Google Cast, and one device acting as host and player at once. The room is simulated in the browser. The lab and landing page have no automated browser tests, so review them by hand. See the roadmap and verification spike in `docs/`.

## Layout

```
packages/protocol    versions and input validation
packages/game-sdk    seeded RNG, manifest check, leak detector
packages/room        LocalRoom: authority and per-role views
packages/ui-kit      display, phone, and host renderers plus CSS
games/trivia         rules, Open Trivia Database client, fallback set
games/werewolves     rules and roles
tests/               node:test suites
```

## Credits and licenses

Code is MIT. Trivia questions from the [Open Trivia Database](https://opentdb.com) are CC BY-SA 4.0 and shown with attribution.
