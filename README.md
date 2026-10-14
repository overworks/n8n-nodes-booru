# @overworks/n8n-nodes-booru

[English](README.md) | [한국어](README.ko.md)

An n8n community node for Danbooru and servers implementing the Danbooru JSON API.
It supports anonymous requests and username/API key authentication without additional
runtime dependencies.

## Operations

| Resource | Operation | Description                                         |
| -------- | --------- | --------------------------------------------------- |
| Post     | Search    | Search with native Danbooru tags and metatags       |
| Post     | Get       | Retrieve one post by ID                             |
| Tag      | Search    | Find tags by name pattern, category, and sort order |

Every result becomes a separate n8n item. Post results include file URLs when the
server makes them available; this version does not download image files.

## Compatibility

Use the default `https://danbooru.donmai.us` or the URL of a compatible instance.
Base URLs with a path prefix, such as `https://example.org/booru`, are supported.
The server must implement `/posts.json`, `/posts/{id}.json`, and `/tags.json`
with the Danbooru response structure and query parameters.

Gelbooru, Moebooru, and e621 use different APIs and are not supported by this
initial adapter. Changing their Base URL alone will not make them compatible.
Individual clones may differ in available fields, account permissions, and limits.

Use the current Node.js 24 LTS release for development. The package targets Node.js
22.16 or later and is built against `n8n-workflow` 2.16.0. Compatibility
with individual n8n releases and clones should be checked before deployment.
This package is not currently an n8n verified community node.

## Installation

After the package has been published, install `@overworks/n8n-nodes-booru` from
**Settings → Community Nodes** in a self-hosted n8n instance. Unverified community
nodes cannot be installed on n8n Cloud.

For local development before publication, follow [Development](#development).

## Credentials

Credentials are optional. Leave the credential selector empty for anonymous requests
and set the node's **Base URL** to the desired instance.

To authenticate, create a **Booru API** credential with:

- **Base URL**: the server that issued the API key.
- **Username**: your account's login name.
- **API Key**: generated in that server's account settings.

When a credential is selected, its Base URL takes precedence over the node's Base URL.
Authentication uses HTTP Basic authentication, with the API key as the password.
Credentials are managed by n8n and are not included in node output. Credential testing
calls `/profile.json`; compatible clones must expose that authenticated endpoint.
Redirects are disabled; use the server's final API URL.

Set **User Agent** to identify your integration, including your account ID when
available, for example `n8n-nodes-booru/0.1.0 (user #1234)`. The node supplies an
application-specific default. Follow your server's API usage requirements.

## Usage

Import [the example workflow](examples/search-posts-and-tags.json) into n8n for
anonymous post and tag searches.

For **Post → Search**, enter a query such as `landscape rating:g`. Queries are sent
unchanged, including exclusions and metatags. Search tag limits depend on your account
and server; supplying an API key does not automatically remove them.

For **Tag → Search**, enter `landscape*` in **Name Matches**, optionally select a
category, and choose a sort order. General is category `0`, not an absent filter.

### Pagination and request limits

- **Limit** is the maximum number of results returned across pages, not the page size.
- **Return All** retrieves pages until an empty page is returned, subject to server
  limits and a guard of 1000 pages per input item.
- **Page** starts at `1`. Posts also accept a before-ID cursor such as `b12345`,
  for posts before ID 12345. Cursor searches require the default ID-descending order
  or `order:id_desc`. Tags use numeric pages.
- Small server pages do not prematurely end a search. Overlapping records are
  deduplicated, and a repeated page or a non-advancing cursor raises an error.
- `order:random` searches use one page only, with Return All off and Limit at most 200.
- The default request interval is 1000 ms, shared across input items and pages in
  one node execution. Separate executions and other nodes have independent limits;
  serialize workflows when they share the same server/account/IP quota.
- HTTP 429 responses are retried up to three times, respecting `Retry-After` and
  exponential backoff. A delay exceeding 60 seconds is reported for a later workflow
  run instead of retrying earlier than the server permits. Other HTTP errors fail
  immediately. n8n's normal **On Error** settings remain available.
- The server's pagination-limit response (410) explains how to resume an ID-ordered
  post search with a before-ID cursor. No automatic fallback changes search order.

### Output

**Raw** is the default: each item's JSON contains the original API record, including
fields specific to your server.

**Normalized** is available for posts and adds predictable fields such as `postUrl`,
`fileUrl`, `previewUrl`, `sampleUrl`, `tags`, and `tagCategories`. The complete original
record remains under `raw`. Danbooru rating codes (`g`, `s`, `q`, `e`) are preserved
without merging categories. Missing file URLs remain `null`; restricted or deleted
posts are not silently removed.

## Development

The project follows the official `@n8n/node-cli` declarative template and uses n8n's
HTTP and credential helpers. `dependencies` is intentionally empty; `n8n-workflow`
is provided by the host as a peer dependency.

```sh
npm ci --ignore-scripts
npm run check
npm run dev
```

The development toolchain has unrelated optional peer integrations, so `.npmrc`
uses `legacy-peer-deps=true`. Installing with `--ignore-scripts` avoids an upstream
ESLint plugin's package-manager-specific preinstall hook. Project checks still run
explicitly through `npm run check` and during publication.

`npm run dev` loads the node into a development n8n instance. Follow the CLI prompts
for its supported local runtime. To use an existing instance, see the
[official CLI documentation](https://docs.n8n.io/connect/create-nodes/build-your-node/using-the-n8n-node-tool).

Other commands:

```sh
npm run lint
npm run build
npm test
npm pack --dry-run
```

Tests use Node's built-in test runner and simulated API responses. They cover request
construction, credential/server selection, pagination, throttling, retry behavior,
response validation, and lossless normalization without requiring account credentials
or downloading images.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development, testing, and pull request guidance.
Coding agents should also read [AGENTS.md](AGENTS.md).

## Publishing

The GitHub Actions publish workflow runs on version tags such as `v0.1.0` or `0.1.0`.
The tag must match `package.json`. It runs the checks through `prepublishOnly` and
publishes with npm provenance and public access.

Configure npm Trusted Publishing for repository `overworks/n8n-nodes-booru` and
workflow `publish.yml`. For the first publication, or when trusted publishing is
not configured, provide a suitably scoped npm token as the repository's `NPM_TOKEN`
secret. Publishing does not by itself grant n8n verification or Cloud availability.

## References

- [n8n community node development](https://docs.n8n.io/integrations/community-nodes/building-community-nodes)
- [n8n verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines)
- [Danbooru API](https://danbooru.donmai.us/wiki_pages/help:api)
- [Danbooru posts API](https://danbooru.donmai.us/wiki_pages/api:posts)
- [Danbooru tags API](https://danbooru.donmai.us/wiki_pages/api:tags)

## License

[MIT](LICENSE).
