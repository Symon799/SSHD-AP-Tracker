# Testing the SSHD AP Tracker

This project uses Vitest and Playwright for automated tests. The tests are split into three practical layers:

- logic and data tests, which run without a browser or Archipelago server;
- tracker synchronization tests, which replay deterministic client events;
- browser tests, which exercise the real React application in Chromium.

## Local checks

Run the full test suite with:

```text
npm test -- --run
```

Run the TypeScript check and production build with:

```text
npm run lint:ts
npm run build
```

Audit the generated SSHD data with:

```text
npm run audit:sshdDump
```

This checks that the dump parses, every check is represented in the item index, and the currently
supported sanity options are present.

The combined validation command is `npm run check`. It runs the data audit, tests, TypeScript check,
ESLint, Prettier, browser tests, and the production build.

`run-checks.bat` runs `npm run check` from the repository root and keeps the Windows terminal open so
the output can be reviewed after the command finishes.

The current baseline passes `npm run check`: the SSHD data audit passes, all 115 Vitest tests pass,
the Playwright browser tests pass, TypeScript passes, and the production build succeeds.

The broader `npm run lint` command is separate from the functional check so formatting and static
analysis can also be run independently. ESLint and Prettier currently pass across the repository.

## Browser tests

Browser tests use Playwright with Chromium and start both a local Vite development server and a small
simulated Archipelago WebSocket server automatically. The simulator implements the connection handshake,
data package, checked locations, received items, and the location-count data needed by the tracker.
Run only these tests with:

```text
npm run test:e2e
```

The first run downloads the Chromium test browser. The current tests verify that the options page loads
the local SSHD logic without browser errors, keeps the disconnected connection form editable, connects
to the simulator, launches the tracker, renders the map, applies checked-location counts, and displays
the received Progressive Sword progression in its tooltip. They never connect to a real Archipelago server.

The simulator lives in `tests/e2e/mock-archipelago-server.mjs`. Keep its fixture small and deterministic;
add a new packet or state only when a browser test needs to cover that behavior.

When a browser test fails, Playwright keeps a screenshot, video, and trace in `test-results/` so the
failure can be inspected locally. CI publishes the test output through the GitHub Actions job.

## What the tests should protect

The most important behaviors are item progression, checked and accessible locations, reconnect handling,
required-dungeon handling, entrance assignments, and APWorld option-dependent locations such as pots,
pumpkins, and barrels. Tests should use deterministic fixtures and should not require a live game or
Archipelago server.

When the APWorld changes, compare its generated locations, items, and options with the local SSHD dump
before adding or changing logic. Ambiguous logic changes must be reviewed manually instead of inferred by
an automated script.

## Reporting failures

When a check fails, record whether it is:

- a regression caused by the current change;
- an outdated expectation;
- an existing failure unrelated to the current change; or
- a behavior that still requires manual verification in a real Archipelago session.

Do not make the whole suite appear green by weakening or deleting a failing assertion without explaining
the behavioral change.

When reporting a local check, include the command used and whether the failure came from the data audit,
Vitest, TypeScript, or the production build. For a full local validation, report `npm run check`; the
optional lint commands should be reported separately until the repository-wide baseline is clean.
