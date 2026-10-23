# AGENTS.md

These instructions apply to the entire repository.

## Project overview

This is a statically generated portfolio site built with Astro and Tailwind CSS. The generated `dist/` directory is deployed as static assets on Cloudflare Workers through Wrangler. There is no server-side Worker entry point and no Astro SSR adapter.

## Tooling and commands

- Use pnpm only. The expected version is pinned in `package.json`.
- Install dependencies with `pnpm install --frozen-lockfile`.
- Start Astro development with `pnpm dev`.
- Create a production build with `pnpm build`.
- Preview the production build in the local Workers runtime with `pnpm preview`.
- Validate Worker packaging with `pnpm exec wrangler deploy --dry-run` after building.
- Run `pnpm deploy` only when the user explicitly asks for a remote deployment.

When dependencies change, update and commit `pnpm-lock.yaml`. Do not create `package-lock.json` or another package-manager lockfile.

## Repository structure

- `src/pages/index.astro` composes the single-page site.
- `src/components/` contains page sections and shared UI.
- `src/layouts/Layout.astro` owns the document shell and global styles.
- `public/` contains assets copied directly into the production build.
- `astro.config.mjs` configures the static Astro build.
- `tailwind.config.mjs` contains the design tokens and Tailwind configuration.
- `wrangler.jsonc` is the source of truth for Cloudflare Workers deployment.
- `dist/` and `.astro/` are generated; never edit or commit them.

## Implementation conventions

- Keep the site statically generated unless a requested feature explicitly requires server-side behavior.
- Prefer small Astro components and compose them from the page instead of growing a single large file.
- Follow the existing formatting: two-space indentation, single quotes in JavaScript, and semicolons.
- Prefer existing Tailwind utilities and theme tokens over one-off inline styles. Put truly global CSS in the layout.
- Preserve responsive behavior, semantic HTML, keyboard usability, visible focus states, useful alternative text, and sufficient color contrast.
- Place public URLs and downloadable media in `public/`; import build-processed assets from source code when appropriate.
- Keep content, names, contact details, and external links unchanged unless the task explicitly calls for editorial changes.

## Cloudflare configuration

- Use `wrangler.jsonc`, not TOML.
- This static site should use `assets.directory: "./dist"`; do not add a `main` entry or `@astrojs/cloudflare` unless the application is intentionally migrated to SSR or Worker code.
- Keep `compatibility_date` deliberate. Before advancing it or adding Wrangler fields, check the installed Wrangler schema and current Cloudflare documentation, then run a build and dry run.
- Never commit credentials. Use ignored `.dev.vars` files for local secrets and Wrangler secret management for deployed secrets.
- Do not change remote routes, domains, bindings, or Cloudflare resources without explicit authorization.

## Validation and handoff

For normal source or configuration changes, run:

```bash
pnpm build
pnpm exec wrangler deploy --dry-run
```

There is currently no separate test, lint, or type-check script. If one is introduced, document it here and run it for relevant changes. Before handing off, inspect `git status` and avoid modifying or reverting unrelated user work.
