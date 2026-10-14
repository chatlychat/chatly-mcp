# @chatlychat/mcp — changelog

## 0.1.3 — 2026-10-14

- Description only; no code change. The npm page advertised "49 typed tools"
  while the server has exposed 83 for some time — npm freezes a version's
  metadata, so the correction needed a publish. It now states the split the
  design turns on: 76 reads, 7 writes. An integrator found three different
  tool counts across our own pages and the npm listing (49 / 78 / 83); 83 is
  the measured one, and `check-docs-install-claims.mjs` holds the docs to it.

