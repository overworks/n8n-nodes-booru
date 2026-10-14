# Repository instructions for coding agents

These instructions apply throughout this repository. Follow the user's requested
scope and existing authorization. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the
shared development workflow and [README.md](README.md) for the public behavior contract.

## Project and navigation

- Package: `@overworks/n8n-nodes-booru`. The current development line is `0.x`.
- Runtime: TypeScript compiled to CommonJS, using n8n declarative routing and no
  additional runtime dependencies. The host provides `n8n-workflow` as a peer.
- Supported API: Danbooru JSON and compatible instances. Gelbooru, Moebooru,
  and e621 require separate adapters; do not treat them as interchangeable URLs.
- `nodes/Booru/Booru.node.ts`: UI, operation values, and routing definitions.
- `nodes/Booru/helpers.ts`: `prepareRequest`, `receiveResponse`, `sendRequest`,
  rate-limit handling, validation, and normalization.
- `credentials/BooruApi.credentials.ts`: authentication and `/profile.json` testing.
- `tests/booru.test.cjs`: mock API responses, mock timers, and package asset checks.
- `nodes/Booru/Booru.node.json`, `icons/`, and `package.json`: discovery metadata,
  light/dark icons, and compiled node/credential registration.
- `README.md` is the English primary document; `README.ko.md` is the Korean version.
  `examples/` contains importable workflows; `.github/workflows/` defines CI and publication.

## Working method

1. Inspect `git status` and the relevant source, tests, and package scripts before
   editing. Preserve unrelated changes and use `rg` for targeted searches.
2. Make the smallest coherent change that completes the task. Follow the existing
   structure; separate engine-specific behavior when adding a different API family.
3. Update affected tests, examples, and both READMEs when behavior changes. Keep
   node UI text and errors in English; retain English UI names in Korean instructions.
4. Validate according to the change type below. Report what changed, what passed,
   and any remaining limitations. Do not describe mock tests as live API validation.

Edit source files. Do not hand-edit or commit `dist/`, `node_modules/`, `.cache/`,
or generated package archives. Prefer an ignored workspace cache for temporary
artifacts; clean up only artifacts created for the task. Use the locked npm
dependencies and preserve `.npmrc` unless changing the toolchain is part of the task.

## Behavior to preserve

- Use n8n routing and its HTTP/credential helpers instead of a separate HTTP client
  or Booru SDK. Keep `dependencies` empty and `peerDependencies.n8n-workflow` as `*`.
  Keep `n8n.strict` and the official ESLint configuration enabled.
- Read runtime configuration through node parameters and credentials, not the
  filesystem or environment variables. Tests and development tooling have a
  different scope and may use Node's built-in modules.
- Selected credentials determine the authenticated destination. Anonymous requests
  use the node's Base URL. Preserve path prefixes, URL validation, disabled redirects,
  and the identifying User-Agent. Do not put secrets in parameters, outputs, or logs.
- `prepareRequest` deliberately enables `ignoreHttpStatusErrors` so `receiveResponse`
  can preserve `Retry-After` before n8n error wrappers discard it. Always reject
  non-2xx responses in that handler; this option must not turn failures into results.
- Use `NodeApiError` and `NodeOperationError` at n8n execution boundaries. Retry only
  the current failed request, respect server delays, and retain retry bounds.
- Request pacing and 429 cooldowns are shared across input items within one node
  execution. Keep waits cancellable through n8n's helpers; this is not a global
  rate limiter across workflows or processes.
- Preserve numeric pagination, ID-descending `b<ID>` cursors, random-search limits,
  overlap deduplication, and repeated-page guards. A small page alone does not mean
  the search is finished. Do not silently change ordering to avoid pagination limits.
- Raw output preserves API records. Normalized posts retain the full record under
  `raw`, keep `g`, `s`, `q`, and `e` distinct, and represent missing file URLs as `null`.
- Node/credential names, parameter keys, operation values, and output shapes affect
  saved workflows. Handle intentional breaking changes explicitly, including any
  versioning and migration requirements.

## Commands and validation

Use a current Node.js 24 LTS release for development. CI runs on Node.js 22 and 24.

```sh
npm ci --ignore-scripts
npm run check
npm run dev
```

Keep `--ignore-scripts` for dependency installation; an upstream development package
has a package-manager-specific preinstall hook. Project checks run explicitly.

- **Runtime or dependency changes:** run `npm run check` (lint, build, tests). Add
  focused regression coverage for changed behavior using mock responses and timers.
- **Packaging, registration, or asset changes:** run the applicable code checks and
  `npm pack --dry-run`; inspect the registered files and icons in the package.
- **Documentation-only changes:** check formatting on touched files, local links,
  command examples, and `git diff --check`. Do not rebuild runtime code or add tests
  solely for prose edits.
- `npm test` rebuilds before testing. If invoking `node --test` directly for focused
  work, rebuild after TypeScript changes so tests do not use stale `dist/` files.
- Format only touched files with the repository's Prettier settings. Once relevant
  checks pass, repeat them only after further changes or a concrete unresolved concern.

Never use real API keys or live image downloads as prerequisites for automated tests.
For manual checks, distinguish local n8n execution from live server validation and
report anything that could not be verified.

## Git and releases

Commit, push, tag, or publish only when included in the user's requested work;
authorization already given for that work remains valid. Do not run
`npm run release`, `npm publish`, or push version tags as verification steps.
Version-tag pushes matching `.github/workflows/publish.yml` trigger npm publication.

When release work is requested, follow [Publishing](README.md#publishing), keep
version metadata and User-Agent identifiers consistent, and preserve provenance
publication. Do not claim n8n verification or Cloud availability merely because the
package builds or publishes successfully.
