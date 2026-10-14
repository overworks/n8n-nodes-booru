# Contributing

This guide covers contributions to `@overworks/n8n-nodes-booru`. For installation
and node usage, read the [English README](README.md) or [한국어 README](README.ko.md).
Coding agents should also follow [AGENTS.md](AGENTS.md).

## Reporting bugs and proposing features

Use the [issue tracker](https://github.com/overworks/n8n-nodes-booru/issues).
For bugs, include the package and n8n versions, the server or API engine involved,
the selected operation, reproduction steps, and the expected and actual results.
A minimal workflow and a small, redacted API response are especially useful.
Remove credentials, authorization headers, and private account data before sharing.

For new operations or server support, describe the workflow they enable and link
the server's API documentation. The current implementation targets the Danbooru
JSON API. Other Booru engines need their own request and response handling;
a different Base URL alone does not establish compatibility.

## Development setup

Use a current Node.js 24 LTS release and npm. CI also checks Node.js 22.
After cloning the repository and entering its directory, install the locked
dependencies:

```sh
npm ci --ignore-scripts
```

Keep the repository's `.npmrc` setting, `legacy-peer-deps=true`. It avoids installing
unrelated optional peer integrations from the development toolchain.
`--ignore-scripts` skips an upstream ESLint plugin's package-manager-specific
preinstall hook. Run the project's own checks explicitly.

Start a local development instance with:

```sh
npm run dev
```

For external n8n instances and runtime setup, see the
[development instructions](README.md#development). Use test accounts when checking
authenticated operations. The automated tests do not require live credentials.

## Where changes belong

| Location                                                                | Purpose                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [Booru.node.ts](nodes/Booru/Booru.node.ts)                              | Node UI, operations, and declarative routing                            |
| [helpers.ts](nodes/Booru/helpers.ts)                                    | Request validation, pagination, retries, throttling, and output mapping |
| [BooruApi.credentials.ts](credentials/BooruApi.credentials.ts)          | Credential fields, Basic authentication, and connection testing         |
| [Booru.node.json](nodes/Booru/Booru.node.json) and [icons](icons/)      | Node discovery metadata and theme assets                                |
| [tests](tests/)                                                         | Node's built-in test runner, mock responses, and mock timers            |
| [examples](examples/)                                                   | Importable n8n workflows without embedded credentials                   |
| [package.json](package.json) and [package-lock.json](package-lock.json) | Package registration, scripts, and reproducible dependencies            |
| [.github/workflows](.github/workflows/)                                 | CI and npm publication                                                  |

Edit source files, not generated files in `dist/` or installed files in
`node_modules/`. Keep temporary artifacts in ignored locations such as `.cache/`.

## Implementation conventions

- Use TypeScript for runtime code and follow the existing declarative node design.
  Add focused helpers when an operation needs custom request or response handling.
- Keep runtime dependencies empty. Use n8n's routing, HTTP, credential, error, and
  cancellation helpers. Development dependencies belong in `devDependencies`;
  update the lockfile alongside dependency changes.
- Keep the official ESLint configuration and `n8n.strict` enabled. Format changed
  files with Prettier using the repository configuration.
- Keep node UI labels, descriptions, and errors in English. Update `README.md`
  and `README.ko.md` together when documented behavior changes, retaining the
  English UI names in Korean instructions.
- Treat node names, credential names, parameter keys, operation values, and output
  fields as workflow compatibility contracts. Describe migration needs when a
  change would affect saved workflows.
- Preserve credential-bound server selection, raw API data, rating codes, request
  pacing, bounded retries, pagination guards, and cancellation behavior. See
  [AGENTS.md](AGENTS.md#behavior-to-preserve) for implementation details.

When adding a node, credential, or asset, update the package's `n8n` registration,
discovery metadata, documentation, and relevant examples. Confirm that the built
package contains the registered files and both icon variants.

## Validation

For runtime code or dependency changes, run:

```sh
npm run check
```

This runs lint, builds TypeScript and assets, and executes the test suite.
`npm test` also builds before testing: tests import compiled files from `dist/`,
so running the test runner directly against an old build can miss source changes.

Add regression coverage for behavior changes. Reuse the mock response and timer
patterns in [booru.test.cjs](tests/booru.test.cjs). Cover the affected failure modes,
such as authentication errors, small or overlapping pages, repeated cursors,
rate-limit headers, cancellation, and unavailable file URLs. Keep automated tests
independent of live servers, real credentials, and image downloads.

For packaging, registration, or asset changes, also inspect:

```sh
npm pack --dry-run
```

For documentation-only changes, check formatting and links; a full runtime rebuild
is unnecessary. For example, when editing these guides:

```sh
npm exec -- prettier --check CONTRIBUTING.md AGENTS.md
git diff --check
```

For new operations or UI changes, also exercise a minimal workflow in a local n8n
instance when available. In the PR, distinguish automated mock tests from manual
checks against a running n8n instance or a live API, and state any untested behavior.

## Pull requests

For work on the current `0.x` line, branch from and target `0.x`. Keep each PR focused
on one change, avoiding unrelated formatting, dependency upgrades, or generated files.

Explain the concrete problem and resulting behavior. Include relevant validation,
API documentation for new integrations, example workflows for user-facing changes,
and any compatibility or migration implications. A clear commit subject such as
`fix: preserve retry delays from wrapped API errors` helps reviewers follow the work.

## Release changes

Normal contributions do not require a version bump or a release tag. The
[publish workflow](.github/workflows/publish.yml) publishes to npm when a matching
version tag is pushed. `npm run release` and `npm publish` are release actions,
not validation commands.

Coordinate release work with the maintainer and follow [Publishing](README.md#publishing).
For a version change, keep package metadata, the lockfile, and versioned User-Agent
identifiers consistent. npm publication and n8n verification are separate steps.

The project uses the [MIT license](LICENSE). Preserve applicable license notices
when adapting existing code.
