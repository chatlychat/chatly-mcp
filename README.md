# @chatlychat/mcp

The Chatly [Model Context Protocol](https://modelcontextprotocol.io) server:
49 typed tools over stdio or a remote HTTP endpoint.

Full documentation, including the tool list and the permission model, is at
[chatlychat.com/docs/api-mcp](https://chatlychat.com/docs/api-mcp). The source
of that page is `apps/marketing/content/docs/api-mcp.mdx`.

## stdio

```bash
pnpm --filter @chatlychat/mcp build
CHATLY_API_URL=https://api.example.com CHATLY_API_KEY=ck_live_… node dist/main.js
```

A host launches this as a child process. stdout **is** the protocol channel,
so nothing but MCP frames may be written to it — every diagnostic in this
package goes to stderr for that reason.

## HTTP

```bash
MCP_HTTP_PORT=4010 CHATLY_API_URL=https://api.example.com node dist/main.js
```

No `CHATLY_API_KEY`. Over HTTP the credential is the **caller's** own
`Authorization: Bearer` header, forwarded verbatim per request — a `ck_`
workspace API key or an Atlas session token. This process holds no credential,
no database and no session store, which is why a fresh MCP server is built per
request rather than once at boot: one shared context would answer every caller
as whoever started the process.

## What keeps it honest

- `src/tools/reachability.spec.ts` reads the API's own guard decorations from
  source and fails if a tool targets a route an API key cannot open. Five of
  eight tools once pointed at doors keys cannot open, and the mocked suite was
  green throughout.
- `src/tools/registry.spec.ts` pins the `mutating` flag, the idempotency key
  on writes, and the input caps.
- `src/http.spec.ts` makes two requests with two tokens over a real loopback
  server and asserts which credential reached the API each time.

---

## About this repository

This is a **mirror**. `@chatlychat/mcp` is built from a private monorepo where the rest
of the platform, its migrations and its contract checks live, so a pull request here
cannot be merged directly — but a patch is still the fastest way to get something
fixed and we will port it with attribution.

What you can do here: read the source, run the tests, open an issue, or open a PR
and we will treat the diff as the proposal.

Not mirrored: src/tools/reachability.spec.ts — specs that assert a type restated here still
matches the monorepo's original, which is only a meaningful claim inside it. They
keep running there.

Issues: https://github.com/chatlychat/chatly-mcp/issues · Docs: https://chatlychat.com/docs
