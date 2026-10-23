# Backend, CMS, and Backoffice — Implementation Plan

> Add an SEO-friendly React single-page application, editor-friendly content backoffice, and secure data backend while keeping the initial public view statically pre-rendered and fast.
>
> **Status:** Proposed
> **Repository:** `artist-website`
> **Last updated:** 2026-10-23

---

## Overview

The current site is a single statically generated Astro page. Site copy, navigation, contact details, social links, music, and video placeholders are hard-coded in Astro components. The contact form only displays a success message in the browser; it does not submit or persist data. `wrangler.jsonc` deploys `dist/` as Workers Static Assets and has no Worker entry point, database, object storage, authentication, or administrative interface.

The proposed system keeps Astro in static-output mode and uses it to pre-render the initial document for a React single-page application (SPA) at `/`. React owns the public UI after hydration, while Astro preserves crawlable HTML and build-time metadata. The system introduces two deliberately separate data domains:

1. **Sanity Content Lake and Sanity Studio** for public site settings, structured content, drafts, publishing, and editorial media.
2. **Cloudflare Worker and D1** for private operational data, initially contact inquiries and their status history.

Sanity Studio is embedded under `/admin/content`. A small `/admin` hub links to content management and an Access-protected inquiry inbox. Published content changes trigger a Cloudflare Workers Build through a deploy hook. The public site continues to serve pre-rendered HTML and assets; only `/api/*` requests invoke Worker code.

```text
Editor
  |
  +--> /admin/content --> Cloudflare Access --> Sanity Studio --> Content Lake
  |                                                        |
  |                                                        +--> publish webhook
  |                                                               |
  |                                                               v
  |                                                    Cloudflare Workers Build
  |                                                               |
  |                                                               v
  |                                                     Astro static deployment
  |
  +--> /admin/inquiries --> Cloudflare Access --> Worker admin API --> D1

Visitor --> Astro-pre-rendered React SPA at `/` --> React hydration/client runtime
        --> POST /api/contact --> validation + Turnstile --> D1
```

### Current-State Gaps

| Area | Current state | Required state |
|---|---|---|
| Site content | Hard-coded across `src/components/*.astro` | Typed, editable, publishable content records |
| Public UI architecture | Separate Astro section components with local scripts | One typed React SPA, pre-rendered by Astro and hydrated at `/` |
| Loading strategy | No production media yet; no explicit critical/lazy policy | Eager critical content, lazy below-fold media, click-to-load third-party embeds, and enforced bundle budgets |
| Search visibility | Static title/description only; no canonical, social metadata, structured data, sitemap, or robots policy | Complete server-rendered SEO metadata, crawl controls, structured data, sitemap, and validation workflow |
| Site settings | Title, metadata, contact details, navigation, and social URLs are code | Singleton settings editable without a code change |
| Media | Placeholder blocks and comments | Managed images with alt text, crop/hotspot, and optimized delivery |
| Contact form | Client-only fake success | Validated, spam-protected API with durable storage and honest UI states |
| Backoffice | None | Authenticated content editor and inquiry inbox |
| Publishing | Only source-control deployments | Content publish triggers a controlled static rebuild |
| Private data | No data store | D1 schema, retention, access control, audit trail, and recovery procedure |
| Schema evolution | No persisted schemas or migration process | Versioned, repeatable Sanity and D1 migrations with compatibility and rollback gates |
| Environments | One implicit production configuration | Local, preview, and production configuration with separate data boundaries |
| Testing | Build only | API unit/integration coverage plus build and deployment dry-run checks |

### Recommendation: Integrate Rather Than Build a CMS From Scratch

Use **Sanity Studio** as the content and settings backoffice. Build only the small project-specific parts that an off-the-shelf CMS should not own: the contact API and the inquiry inbox.

| Option | Fit | Advantages | Costs and risks | Decision |
|---|---|---|---|---|
| Sanity Studio + Content Lake | High | Official Astro integration; schemas live in source control; drafts, history, validation, media, and editor authentication already exist; static builds can query published content | SaaS dependency; visual preview for drafts is limited while the frontend remains fully static; plan limits must be checked before launch | **Recommended** |
| Fully custom Worker + D1 + R2 backoffice | Medium | One vendor/runtime, complete UI and data-model control | Must build and maintain authentication, rich-text editing, drafts, publishing, media processing, revision history, validation, and accessibility | Do not choose for the initial portfolio scope |
| Self-hosted Directus, Strapi, or Payload | Low to medium | Mature administration features and database control | Introduces a continuously running Node/container service and database that do not match the current static Workers deployment | Consider only if self-hosting or database portability becomes a hard requirement |
| Git-based CMS | Medium | Low runtime complexity and content changes remain in Git | Poor fit for private submissions, non-technical media workflows, and immediate publishing; every edit creates repository activity | Not preferred |

The managed CMS route is materially smaller and safer. A custom content backoffice becomes reasonable only if requirements later include offline operation, no SaaS dependency, unusual workflow controls, or a single database that must be directly queryable outside the CMS.

### Key Concepts

- **Published content:** Public, non-sensitive documents that Astro reads during a build.
- **Draft content:** Editor work that is not included in the production build until published.
- **Operational data:** Private visitor-generated records such as contact inquiries. It is stored in D1, never in the public CMS dataset or generated HTML.
- **Static publication:** A content publish requests a fresh build. If the build fails, the prior production deployment remains live.
- **Backoffice:** The protected `/admin` area comprising Sanity Studio for content and a purpose-built inquiry inbox.
- **Singleton document:** A schema that permits only one document, used for global site and home-page settings.
- **Pre-rendered React SPA:** The public experience loads one application shell/document, then React owns navigation state, media interactions, and form submissions without full-page reloads. Astro pre-renders the initial `/` view for SEO and resilience.

### Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Rendering model | Preserve `output: 'static'` | The public site does not need per-request rendering; static output remains fast and resilient |
| Public UI | One pre-rendered React SPA mounted by `index.astro` with `client:load` | Provides SPA behavior and shared state without sacrificing crawlable initial HTML |
| SPA routing | One initial location with History/anchor-aware navigation; no routing library initially | A router is unnecessary until the SPA gains distinct URL-addressable views beyond the section fragments |
| Loading policy | Critical-first with native lazy loading and media facades | Protects LCP while deferring below-fold images and expensive YouTube/Spotify/SoundCloud requests |
| SEO rendering | All indexable content, metadata, canonical tags, and JSON-LD in build output | Crawlers and social preview agents must not depend on React hydration |
| Content platform | Sanity | It supplies the expensive generic CMS capabilities and has an official Astro integration |
| Private record store | Cloudflare D1 | Contact inquiries are relational, low-volume, private, and naturally accessed through a Worker binding |
| Media store | Sanity's asset pipeline for editorial media | Avoids building an uploader, image metadata UI, and transformation service; do not add R2 until there is a non-CMS file requirement |
| Dynamic runtime | Add one Worker entry point to the existing deployment | The requested backend intentionally extends the assets-only Worker; selective `run_worker_first` keeps static requests on the asset path |
| Admin authentication | Sanity authentication for Studio plus Cloudflare Access for `/admin/*` and `/api/admin/*` | Avoids writing password, session, recovery, and MFA flows; admin APIs also validate the Access JWT |
| Public form protection | Server-side validation, Turnstile, rate controls, honeypot, and generic errors | Reduces automated abuse and prevents trusting client-side checks |
| Publication | Sanity document webhook to a Cloudflare Workers Builds deploy hook | Published content becomes static output without converting Astro to SSR |
| Content model | Fixed, typed sections rather than a general page builder | The site is a single designed page; unconstrained blocks would add complexity and permit broken layouts |
| Secrets | Wrangler secrets and provider dashboards only | No CMS tokens, Turnstile secrets, deploy-hook URLs, or Access credentials are committed |
| Data minimization | Do not persist raw IP addresses or Turnstile tokens | The inbox needs the message and reply details, not unnecessary security telemetry |
| Retention | Default inquiry retention of 24 months, configurable after owner/privacy review | Gives an explicit deletion policy; this is a product policy, not legal advice, and must be confirmed before launch |
| Future migrations | Expand–migrate–contract with versioned migration code | Prevents a schema deployment from making existing content, older code, or in-flight requests unreadable |

### Development Approach

Deliver this in additive stages. First add the React and CMS integrations and create the content schemas without changing production rendering. Next import the existing content, add typed build-time queries, and convert the public experience to one hydrated React SPA after visual parity is proven. Then add the Worker/D1 contact path. Finally add the protected inbox and publishing automation. Each stage must keep the existing static deployment buildable, and production enablement is a separate, explicit action.

---

## A. Target Architecture

### A.1 Request Routing

The existing Worker continues to own `dist/`. Add a Worker module and configure the assets binding so only API routes execute code first.

Illustrative `wrangler.jsonc` shape; verify against the installed schema before implementation:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "artist-website",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-23",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*"],
    "not_found_handling": "404-page"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "artist-website-production",
      "database_id": "<provisioned-id>",
      "migrations_dir": "worker/migrations"
    }
  ],
  "observability": {
    "enabled": true
  }
}
```

The Worker must return API responses for known `/api/*` routes and `404` for unknown API routes. It must not turn missing API paths into `index.html`. Static assets should bypass Worker execution unless required by a route pattern.

### A.2 Components and Ownership

| Component | Responsibility | Data classification |
|---|---|---|
| Astro | Fetch published content at build time, own the document shell/metadata, and pre-render the React root | Public |
| React public app | Render navigation and all portfolio sections at `/`; own browser interactions and shared page state | Public |
| Sanity Content Lake | Site settings, home-page sections, tracks, videos, editorial image assets | Public after publish; drafts restricted |
| Sanity Studio | Content entry, validation, drafts, publish, history | Restricted editor surface |
| Cloudflare Worker | Contact submission and protected admin APIs | Mixed; explicit route boundary |
| D1 | Inquiries, status changes, idempotency, minimal audit data | Private |
| Cloudflare Access | Permit approved identities to reach admin pages/APIs | Authentication metadata |
| Workers Builds | Rebuild and deploy static output after content publish | Build metadata |
| Turnstile | Bot signal for public form submissions | Ephemeral verification data |

### A.3 Environment Boundaries

| Environment | Sanity | D1 | Worker configuration |
|---|---|---|---|
| Local | Development dataset or an explicitly approved shared public dataset | Wrangler local D1 | `.dev.vars` for local secrets; never committed |
| Preview | Published content dataset unless editorial isolation is required | Dedicated preview D1 binding | Preview-specific Access audience, Turnstile test keys, and bindings |
| Production | Production dataset | Production D1 | Production secrets and Access application |

Do not point local destructive tests or preview deployments at the production D1 database. Sanity drafts can coexist with published documents in one dataset, so an extra CMS dataset is optional rather than mandatory.

### A.4 SEO-Friendly React SPA

`src/pages/index.astro` remains the build-time boundary. It loads and validates published CMS content, supplies document metadata through `Layout.astro`, and passes a serializable page model into the React SPA. Astro renders the initial HTML; after hydration, React handles public interactions without document reloads.

```astro
---
// Illustrative only.
import Layout from '../layouts/Layout.astro';
import { ArtistApp } from '../app/ArtistApp';
import { getHomePageContent } from '../lib/content/getHomePageContent';

const content = await getHomePageContent();
---

<Layout seo={content.seo}>
  <ArtistApp client:load content={content} />
</Layout>
```

Proposed component boundary:

```text
src/pages/index.astro
  `-- src/app/ArtistApp.tsx
       |-- Nav.tsx
       |-- Hero.tsx
       |-- About.tsx
       |-- Music.tsx
       |-- Videos.tsx
       |-- Contact.tsx
       `-- Footer.tsx
```

Rules:

- Use the official `@astrojs/react` integration with `react` and `react-dom`, installed through pnpm.
- Use `client:load`, not `client:only`, so the build emits useful pre-rendered HTML and React hydrates that markup in the browser.
- Keep all public sections under one React root when state must be shared, such as mobile navigation, active-section state, media overlays, or form state.
- Use native semantic anchors (`#about`, `#music`, `#videos`, `#contact`) with SPA-managed active-section/history behavior, useful URLs, focus handling, and browser scrolling. Introduce a routing library only when distinct client-side views require it.
- Keep deep links limited to `/` plus fragments in the initial SPA. If path-based client routes are added later, design the Workers asset fallback and exclusions for `/api/*` and `/admin/*` before enabling them.
- Keep SEO metadata, fonts, favicon, global styles, and the document shell in `Layout.astro`.
- Fetch Sanity content only during the Astro build. Do not expose CMS credentials or refetch the whole page model in the browser.
- Keep local UI state close to the owning React component. Do not add a global state library until cross-section state is substantial enough to justify it.
- The admin hub and Studio remain separate `/admin/*` routes and are not bundled into the public React application.
- Set an initial JavaScript budget and inspect the built client chunks. The React conversion must not silently pull Sanity Studio or admin dependencies into the public bundle.
- Keep all headings, biography, track/video titles, links, and contact information in pre-rendered HTML. Lazy loading may defer media bytes and interactive controls, not discoverable text content.

---

## B. Content and Settings Model

Schema names below are proposed and should be exported from `src/sanity/schemaTypes/index.ts`.

### B.1 `siteSettings` Singleton

```ts
interface SiteSettings {
  siteTitle: string;
  seo: SeoSettings;
  artistName: string;
  shortDescriptor: string;
  contactEmail: string;
  location: string;
  navigation: Array<{ label: string; anchor: string }>;
  socialLinks: Array<{
    platform: 'instagram' | 'youtube' | 'spotify' | 'soundcloud' | 'other';
    label: string;
    url: string;
  }>;
  contactSubjects: Array<{ label: string; value: string }>;
  footerText: string;
}
```

Rules:

- Enforce a single document ID such as `siteSettings`.
- Validate email and absolute `https:` URLs.
- Validate the required SEO fields according to section G.3.
- Anchor values must match rendered section IDs.
- Social labels remain accessible even when an icon is present.
- The contact address may be rendered publicly only if the owner confirms that intent.

### B.2 `homePage` Singleton

```ts
interface HomePage {
  hero: {
    eyebrow: string;
    headingLineOne: string;
    headingLineTwo: string;
    introduction: string;
    primaryCta: Link;
    secondaryCta: Link;
  };
  about: {
    eyebrow: string;
    heading: string;
    portrait?: SanityImageWithAlt;
    body: PortableTextBlock[];
    stats: Array<{ value: string; label: string }>;
  };
  music: SectionHeading & { embedUrl?: string };
  videos: SectionHeading;
  contact: SectionHeading & { introduction: string };
}
```

Keep section order and layout in code for the initial release. Editors can change content and show/hide records but cannot introduce arbitrary components or Tailwind classes.

### B.3 `track` Document

```ts
interface Track {
  title: string;
  releaseType: 'single' | 'collaboration' | 'session' | 'album' | 'other';
  releaseYear?: number;
  artwork?: SanityImageWithAlt;
  listenUrl: string;
  featured: boolean;
  sortOrder: number;
}
```

Validate URL scheme, sensible year bounds, required title, and unique `sortOrder` among featured tracks where practical. The public query orders by `sortOrder` and excludes unpublished documents.

### B.4 `video` Document

```ts
interface Video {
  title: string;
  provider: 'youtube' | 'vimeo';
  videoId: string;
  caption?: string;
  thumbnail?: SanityImageWithAlt;
  featured: boolean;
  sortOrder: number;
}
```

Store provider and validated ID rather than an arbitrary iframe. Build the embed URL in code, use a restricted `allow` list, lazy-load embeds, and retain a text title for accessibility.

### B.5 Query Contract

Create one typed build-time loader that returns the complete page model and fails with a useful build error if required singleton content is missing.

```ts
interface HomePageContent {
  settings: SiteSettings;
  page: HomePage;
  tracks: Track[];
  videos: Video[];
}

export async function getHomePageContent(): Promise<HomePageContent>;
```

Production queries use the published perspective. A CMS outage or schema mismatch should fail the new build, leaving the previous deployment live; the build must not silently publish empty sections.

---

## C. Private Data Model

### C.1 D1 Schema

Proposed migration `worker/migrations/0001_contact_inquiries.sql`:

```sql
CREATE TABLE contact_inquiries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'replied', 'archived')),
  idempotency_key TEXT,
  source_path TEXT,
  ip_hash TEXT,
  spam_score INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

CREATE UNIQUE INDEX idx_contact_inquiries_idempotency
  ON contact_inquiries(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_contact_inquiries_status_created
  ON contact_inquiries(status, created_at DESC);

CREATE TABLE inquiry_events (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('created', 'status_changed', 'deleted')),
  from_status TEXT,
  to_status TEXT,
  actor_email TEXT,
  FOREIGN KEY (inquiry_id) REFERENCES contact_inquiries(id)
);

CREATE INDEX idx_inquiry_events_inquiry
  ON inquiry_events(inquiry_id, created_at DESC);
```

Notes:

- Generate opaque UUIDs in the Worker.
- Normalize email only for reply usability; do not use it as an identity key.
- Hash a truncated client IP with a rotating secret only if rate-control evidence is needed. Never persist the raw IP.
- Soft deletion supports an operator confirmation step. A scheduled or manual purge permanently removes expired/deleted records and corresponding events.
- D1 Time Travel is recovery tooling, not a substitute for the retention and deletion policy.

### C.2 Contact API

`POST /api/contact`

```json
{
  "name": "Visitor name",
  "email": "visitor@example.com",
  "subject": "session",
  "message": "Project details",
  "turnstileToken": "ephemeral-token",
  "company": ""
}
```

`company` is a honeypot and must remain empty. The API accepts JSON only, applies strict byte/character bounds, rejects unexpected fields, verifies Turnstile server-side, and writes the inquiry and `created` event atomically where supported by the selected D1 API pattern.

Response contract:

| Status | Meaning | Body |
|---|---|---|
| `201` | Stored successfully | `{ "ok": true, "reference": "opaque-id" }` |
| `400` | Malformed JSON or unsupported content type | `{ "ok": false, "code": "bad_request" }` |
| `422` | Field validation failed | `{ "ok": false, "code": "validation_failed", "fields": { ... } }` |
| `429` | Bot/rate checks rejected the request | `{ "ok": false, "code": "try_again_later" }` |
| `500` | Unexpected storage/runtime failure | `{ "ok": false, "code": "server_error" }` |

Do not reveal whether a specific email exists, Turnstile internals, database errors, or stack traces. The client displays success only after receiving `201`; failed requests preserve entered values and expose an accessible status message.

### C.3 Admin API

All `/api/admin/*` requests require a valid Cloudflare Access JWT with the configured issuer and audience. Checking only that the header exists is insufficient.

| Method and path | Purpose |
|---|---|
| `GET /api/admin/inquiries?status=&cursor=&limit=` | Cursor-paginated, newest-first list |
| `GET /api/admin/inquiries/:id` | Inquiry detail and event history |
| `PATCH /api/admin/inquiries/:id` | Change status using an allow-listed transition |
| `DELETE /api/admin/inquiries/:id` | Soft-delete after explicit confirmation |

List results should omit the full message until detail is requested. Set `Cache-Control: no-store` on all private responses. Record the validated Access identity email on status and deletion events. Do not put message bodies or email addresses in application logs.

### C.4 Retention and Recovery

- Confirm the final retention period and publish a matching privacy notice before accepting production submissions.
- Provide a purge command or scheduled job that deletes records older than the configured window and already soft-deleted records after a short safety window.
- Document D1 restore steps and verify the account's current Time Travel retention before production migration.
- Export data only for an explicit operational need; exports contain personal data and require the same access restrictions.

---

## D. Backoffice Experience

### D.1 Routes

| Route | Experience | Protection |
|---|---|---|
| `/admin` | Small hub with Content and Inquiries choices | Cloudflare Access |
| `/admin/content` | Embedded Sanity Studio | Cloudflare Access plus Sanity login |
| `/admin/inquiries` | Search/filter list, detail view, and status controls | Cloudflare Access |

The extra Access gate around Studio is defense in depth and provides one approved-identity boundary for the full admin area. Sanity remains the authorization authority for content mutations.

### D.2 Content Workflow

1. Editor signs in and changes a draft.
2. Studio validates required fields, URLs, alt text, and fixed option values.
3. Editor publishes the document.
4. A filtered Sanity webhook calls the secret Workers Builds deploy-hook URL.
5. Astro queries only published content and creates `dist/`.
6. Build and Wrangler deployment checks pass; the new static deployment becomes active.
7. On failure, the previous deployment stays active and the failure is visible in build history.

The deploy-hook URL is a credential. Store it in Sanity's webhook configuration, never in source or client-side code, and rotate it if exposed. Filter out draft-only updates to avoid rebuilding on every keystroke.

### D.3 Inquiry Workflow

```text
new --> read --> replied --> archived
  \                |
   +---------------+

any non-deleted state --> soft-deleted --> purged by retention process
```

The inbox is intentionally not a general CRM. It supports reviewing, replying through the operator's normal email client, tracking state, and deleting records. Email delivery, campaigns, customer accounts, and sales pipelines are outside this plan.

### D.4 Static Preview Limitation

The initial implementation does not add SSR solely for visual draft preview. Editors preview field values and media in Studio, then publish to trigger a static build. If click-to-edit visual preview becomes necessary, assess authenticated preview deployments or a narrowly scoped server-rendered preview route as a separate project.

---

## E. Configuration and Security Reference

### E.1 Configuration Inventory

| Name | Kind | Used by | Secret |
|---|---|---|---|
| `PUBLIC_SANITY_PROJECT_ID` | Build variable | Astro and Studio | No |
| `PUBLIC_SANITY_DATASET` | Build variable | Astro and Studio | No |
| `SANITY_API_VERSION` | Build variable, pinned date | Astro queries | No |
| `PUBLIC_TURNSTILE_SITE_KEY` | Build variable | Contact form | No |
| `TURNSTILE_SECRET_KEY` | Wrangler secret | Public contact API | Yes |
| `ACCESS_TEAM_DOMAIN` | Worker variable | Access JWT verifier | No |
| `ACCESS_AUD` | Worker variable | Access JWT verifier | Treat as configuration, not authentication by itself |
| `IP_HASH_SECRET` | Wrangler secret | Optional abuse hash | Yes |
| `DB` | D1 binding | Worker | Binding |
| Workers Builds deploy-hook URL | Sanity webhook configuration | Publish automation | Yes |

No Sanity read token is required for a public dataset when builds query only published content. If the dataset is made private, inject a read-only token into the build environment; never prefix it with `PUBLIC_`.

### E.2 Security Controls

- Validate all input on the Worker even when the browser validates it.
- Enforce JSON content type, body-size limits, length limits, and normalized string values.
- Verify Turnstile tokens server-side and reject replay according to current product guidance.
- Apply rate controls by endpoint and coarse client signal without retaining raw addresses.
- Validate Access JWT signature, issuer, audience, and expiry for admin APIs.
- Use parameterized D1 statements only.
- Escape output by default and never render inquiry messages as HTML.
- Apply `no-store`, `X-Content-Type-Options: nosniff`, and an appropriate admin Content Security Policy.
- Keep CORS same-origin; do not use `*` for private or mutation endpoints.
- Log request IDs, route, status, latency, and error category—not visitor message content or email.

---

## F. Future Schema and Data Migrations

Persisted data must be treated as a versioned contract. Changing a TypeScript interface, Sanity schema, GROQ projection, or D1 table definition does not by itself update existing records. Every change to a persisted shape requires a migration assessment in the merge request, even when the conclusion is “additive; no backfill required.”

### F.1 Change Classification

| Change type | Examples | Required approach |
|---|---|---|
| Additive | Optional CMS field, nullable D1 column, new document/table | Add first; deploy compatible readers; backfill only if the product requires a value |
| Transforming | Field rename, string-to-array, data normalization, table split | Dual-read old/new shapes, run a versioned idempotent migration, validate, then remove legacy support later |
| Constraint tightening | Required field, unique index, smaller length limit, stricter enum | Audit and repair existing data before enabling the constraint or validation |
| Destructive | Drop field/table, delete document type, change immutable Sanity `_id`/`_type` | Export/backup, prove no readers or references remain, require explicit approval, and perform cleanup in a separate release |

Do not combine an irreversible cleanup with the release that first introduces the replacement shape. The previous deployed code must remain able to operate throughout the migration window.

### F.2 Standard Expand–Migrate–Contract Sequence

```text
Assess --> Back up --> Expand storage/schema --> Deploy dual-compatible readers
   --> Dry-run migration --> Migrate production --> Validate invariants
   --> Switch writers/readers --> Observe --> Contract in a later release
```

1. Document the before/after shape, affected records, compatibility window, invariants, estimated duration, and recovery method.
2. Create a restorable pre-change state: a Sanity dataset export/copy and, for D1, a verified Time Travel bookmark plus an export when the risk justifies longer-lived recovery.
3. Add the new field/table/shape without removing the old one.
4. Deploy code that can read both shapes and continues writing a shape compatible with the old deployment. For a rename, use a fallback such as `coalesce(newField, oldField)` at the query/model boundary.
5. Run the migration against a non-production copy or local database, then run its dry-run mode against the intended target.
6. Review affected counts, sample records, validation output, dangling references, nullability, uniqueness, and application build results.
7. Execute against production using an explicit project/dataset or database name; never rely only on a mutable binding alias.
8. Re-run validation and the principal public/admin flows. Record migration ID, target, time, operator, counts, and outcome without logging private record contents.
9. After a defined observation window, stop writing the old shape and remove fallback reads.
10. Remove deprecated fields/columns only in a later, separately approved migration. Prefer a forward repair over a destructive down migration.

### F.3 Sanity Schema and Content Migration Rules

- Store Sanity migration source in the root `migrations/<migration-id>/` directory used by the pinned Sanity CLI. D1 migrations live separately under `worker/migrations/`.
- Create migrations with stable descriptive IDs and commit them with the schema/query changes they support. Do not delete historical migration code merely because it has run.
- Make migrations idempotent with filters and operations such as “set if missing.” If an operation cannot be naturally idempotent, write and check a stable per-migration marker.
- Mark old fields/types as `deprecated` and read-only in Studio before removing them. The deprecation reason must identify the replacement.
- Intentionally decide whether each migration targets published documents, drafts, or both. Exclude Sanity system/version documents unless the feature explicitly uses them.
- Preserve `_id`, `_type`, references, asset references, array `_key` values, and document history where possible. Changes to immutable `_id` or `_type` require an export/import plan and additional approval.
- Run schema validation and document validation before and after the migration. Sanity Studio validation is not server-enforced for API writes, so the migration must not assume Content Lake rejected invalid historical data.
- Export/copy the target dataset before a production write. Run the Sanity migration in dry-run mode first, review its patches/counts, and specify the production project and dataset explicitly when executing.
- Keep the Astro loader compatible with both shapes until all published documents and relevant drafts validate against the new schema. A build from the migrated dataset is a release gate.

Illustrative rename migration:

```ts
// migrations/20261023-copy-short-descriptor/index.ts
// Illustrative only; verify helpers against the pinned Sanity version.
import { at, defineMigration, setIfMissing } from 'sanity/migrate';

export default defineMigration({
  title: 'Copy shortDescriptor to artistTagline',
  documentTypes: ['siteSettings'],
  filter: 'defined(shortDescriptor) && !defined(artistTagline)',
  migrate: {
    document(document) {
      return at('artistTagline', setIfMissing(document.shortDescriptor));
    },
  },
});
```

During the compatibility window the content loader reads `artistTagline` first and falls back to `shortDescriptor`. A later cleanup migration unsets the old stored value; the old field is removed from queries and schema only after validation proves no required document depends on it.

### F.4 D1 Migration Rules

- Create immutable, sequential SQL files under `worker/migrations/`. Never edit or reorder a migration after it has been applied to any shared environment.
- Use Wrangler's migration table as the execution ledger and inspect the unapplied list before applying changes.
- Target the immutable D1 database name for production migration commands rather than relying only on the `DB` binding name.
- Apply additive D1 migrations before deploying code that depends on them. The old Worker must tolerate the expanded schema.
- For non-trivial transformations, add a new column/table, backfill in bounded and restartable batches, validate row counts/checksums/invariants, switch application reads/writes, and remove the old structure later.
- Add `NOT NULL`, `UNIQUE`, foreign-key, or enum-like checks only after auditing and repairing all existing rows. Create indexes with explicit verification that query behavior and migration duration are acceptable.
- Keep public/admin API contracts backward-compatible for at least the deployment transition. Ignore newly optional request fields in old code and supply safe defaults when old records lack new response fields.
- Do not treat a code rollback as a database rollback. Prefer a forward corrective migration. Use D1 Time Travel only when a confirmed data error justifies restoring the whole database and the recovery consequences are understood.
- Test every migration from a representative pre-migration database, apply it twice only where the tooling/SQL is designed to permit that, then run repository and API regression tests.

Illustrative additive change:

```sql
-- worker/migrations/0002_add_inquiry_priority.sql
ALTER TABLE contact_inquiries ADD COLUMN priority TEXT;

-- Backfill and constraint tightening, if required, occur in later migrations
-- after the deployed Worker can handle both NULL and populated values.
```

### F.5 Migration Pull-Request Checklist

Every persisted-shape change must answer:

- What exact old and new shapes are supported?
- Which deployed readers and writers use the affected fields/tables?
- Are drafts, published documents, references, soft-deleted rows, and historical records covered?
- Is the migration idempotent or safely restartable?
- What is the dry-run output and expected affected-record count?
- What backup/bookmark proves recovery is possible, and how was restore tested?
- Which invariants and user flows prove success?
- When can compatibility code and deprecated data be removed?
- Who explicitly authorizes the production mutation?

---

## G. Lazy Loading, Performance, and SEO

### G.1 Resource Loading Policy

Classify each resource by whether it is required for the first viewport or only later interaction.

| Resource | Loading behavior | Requirements |
|---|---|---|
| Document HTML and critical CSS | Eager | Pre-render complete indexable content; avoid client fetches for initial copy |
| Hero/LCP image, if introduced | Eager and high priority | Never `loading="lazy"`; use explicit dimensions, responsive candidates, appropriate `sizes`, modern formats, and `fetchpriority="high"` only for the confirmed LCP image |
| About portrait and below-fold artwork | Native lazy | `loading="lazy"`, `decoding="async"`, explicit width/height or aspect ratio, responsive `srcset`/`sizes`, useful alt text |
| Video/music embeds | Facade first | Render crawlable title, thumbnail/poster, provider label, and external link; create the third-party iframe only on user activation or a justified near-viewport threshold; iframe also uses `loading="lazy"` |
| React SPA runtime | Hydrate on load | Pre-render content first; keep the initial client bundle small and dynamically import only genuinely heavy optional interactions |
| Admin/Studio code | Separate route chunk | Must never appear in the public `/` bundle |
| Fonts | Critical subset only | Prefer self-hosted WOFF2/variable font, preload only the font needed above the fold, and use `font-display: swap`; retain system fallbacks |

Do not lazy-render SEO-relevant sections with `null` placeholders. The section markup and text remain in the static HTML even when its images, iframe, or enhanced controls load later. A media facade must be keyboard operable, have an accessible name, and reserve the final player's dimensions to prevent layout shift.

Illustrative image policy:

```tsx
<img
  src={image.src}
  srcSet={image.srcSet}
  sizes="(min-width: 768px) 50vw, 100vw"
  width={image.width}
  height={image.height}
  loading={isLcp ? 'eager' : 'lazy'}
  fetchPriority={isLcp ? 'high' : 'auto'}
  decoding={isLcp ? 'sync' : 'async'}
  alt={image.alt}
/>
```

The Sanity image query/mapper must retain intrinsic dimensions and generate constrained responsive URLs. Do not ship a single original-resolution image to every device. Image transformations must preserve crop/hotspot intent and should prefer AVIF/WebP with a supported fallback where the selected delivery helper requires one.

### G.2 SEO Contract

`Layout.astro` owns deterministic, server-rendered head metadata. The CMS supplies editable values but cannot emit arbitrary head HTML.

Required output for `/`:

- One descriptive `<title>` and meta description, with build-time validation for missing/empty values.
- Absolute canonical URL derived from the configured production `site` URL, not from an untrusted request header.
- Open Graph `og:type`, `og:title`, `og:description`, `og:url`, and crawlable `og:image` with known dimensions and alt text.
- Twitter/X card metadata using the same validated title, description, and image.
- Correct `<html lang>`, one meaningful `<h1>`, hierarchical headings, semantic landmarks, and crawlable `<a href>` links.
- `robots` set to index/follow for production `/`; preview, admin, and error surfaces must not be included in the sitemap and must be protected or marked `noindex` as appropriate.
- A generated XML sitemap containing the canonical public URL and a `robots.txt` that points to it. The `site` value in `astro.config.mjs` is required.
- JSON-LD using `ProfilePage` with a `Person` as `mainEntity`, populated only from visible, accurate CMS content such as name, description, portrait, canonical URL, and verified `sameAs` profiles.
- `VideoObject` markup only when every required property is available and the visible page actually presents that video. Do not generate speculative or incomplete structured data.
- A useful static 404 response with `noindex`; API/admin responses are excluded from public indexing.

The canonical URL, Open Graph URL, sitemap entry, and JSON-LD entity URL must agree. Structured data is serialized with a safe JSON serializer and validated in Google's Rich Results Test before production release. Search-result enhancements are eligibility signals, not guaranteed outcomes.

### G.3 CMS Fields and Validation

Extend `siteSettings` with a dedicated SEO object while preserving the fields already proposed in section B:

```ts
interface SeoSettings {
  title: string;
  description: string;
  shareImage: SanityImageWithAlt;
  canonicalPath: '/';
  person: {
    name: string;
    description: string;
    image?: SanityImageWithAlt;
    sameAs: string[];
  };
}
```

Studio validation rejects missing required SEO values, non-HTTPS external profiles, duplicate `sameAs` URLs, and share images without alt text or sufficient source dimensions. Preview/admin controls must not allow an editor to accidentally index a non-production environment.

### G.4 Performance and SEO Budgets

Initial budgets are proposed release gates and should be measured against a production-like preview build:

| Measure | Initial gate |
|---|---|
| Core Web Vitals field target | At the 75th percentile: LCP `<= 2.5s`, INP `<= 200ms`, CLS `<= 0.1` when sufficient field data exists |
| Lighthouse mobile lab run | Median of at least three consistent runs: Performance `>= 90`, SEO `100` |
| Initial first-party JavaScript | `<= 100 KiB` compressed for public `/`; excludes code loaded only after media interaction |
| Initial third-party embeds | Zero YouTube/Spotify/SoundCloud iframe requests before user activation or the explicitly tested lazy threshold |
| Layout stability | Every image, thumbnail, iframe facade, and async status region reserves dimensions/space |
| Search output | Canonical, robots, sitemap, metadata, and JSON-LD checks pass with no critical validation errors |

Lab scores are regression signals rather than guarantees. After launch, use field data to assess Core Web Vitals for mobile and desktop separately. If a numeric budget must change, record the measured reason and approve the change rather than silently weakening the gate.

### G.5 Verification Matrix

| Check | Tool/method | When |
|---|---|---|
| Pre-hydration content and metadata | Inspect built `dist/index.html` with JavaScript disabled | Every relevant merge request |
| Responsive image candidates/dimensions | DOM and network inspection at mobile/desktop widths | Component changes |
| Embed deferral | Browser network log before scroll/click and after activation | Media changes |
| Bundle isolation and size | Astro/Vite build output or bundle report | Every production build |
| Lighthouse and Core Web Vitals lab checks | Lighthouse/Chrome performance trace on production-like preview | Release candidate |
| Structured data | JSON-LD parser plus Google Rich Results Test | Schema/template changes and release candidate |
| Canonical/sitemap/robots | Automated assertions against `dist/` and preview URLs | Every production build |
| Search indexing | Search Console URL Inspection and sitemap status | After authorized production launch |

---

## GitLab Tasks

### Epic 1: Content Platform Foundation

**Area:** CMS and content model
**Assignee:** TBD
**Priority:** High

---

#### Task 1.1 — Provision Sanity and integrate Studio

**Labels:** `backend`, `cms`, `astro`
**Assignee:** TBD
**Blocked by:** Owner approval of Sanity as the CMS

**Description**

Create the Sanity project, add the official Sanity and React integrations using pnpm, embed Studio at `/admin/content`, and configure local/production CORS origins. Preserve Astro static output.

**Acceptance Criteria**

- [ ] Dependencies are installed with pnpm and `pnpm-lock.yaml` is updated.
- [ ] `@astrojs/react`, `react`, and `react-dom` are pinned through the repository package manifest and configured once in `astro.config.mjs`.
- [ ] `sanity.config.ts` and the Studio route build successfully in static mode.
- [ ] Project ID, dataset, and API version come from documented environment variables.
- [ ] No write token or deploy-hook URL appears in the repository or browser bundle.
- [ ] Only controlled local and production origins are configured for authenticated Studio requests.
- [ ] `pnpm build` and `pnpm exec wrangler deploy --dry-run` pass.

#### Code

*Files: `sanity.config.ts`, `astro.config.mjs`, `src/sanity/env.ts`, `src/sanity/schemaTypes/index.ts`, `.env.example`*

```ts
// Illustrative only.
sanity({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  studioBasePath: '/admin/content',
});
```

---

#### Task 1.2 — Implement structured content schemas and editor validation

**Labels:** `cms`, `content-model`
**Assignee:** TBD
**Blocked by:** Task 1.1

**Description**

Implement the singleton settings/page documents and repeatable track/video documents from section B. Configure Studio structure so singleton documents cannot be duplicated.

**Acceptance Criteria**

- [ ] Settings, home page, track, and video schemas match section B.
- [ ] Required text, email, URL, media alt text, provider IDs, and ordering fields are validated.
- [ ] Singleton documents appear once and cannot be created from the generic new-document menu.
- [ ] Editor labels and descriptions explain how fields appear on the site.
- [ ] Schema tests or scripted validation cover representative valid and invalid documents.

#### Code

*Files: `src/sanity/schemaTypes/siteSettings.ts`, `src/sanity/schemaTypes/homePage.ts`, `src/sanity/schemaTypes/track.ts`, `src/sanity/schemaTypes/video.ts`, `src/sanity/structure.ts`*

---

#### Task 1.3 — Import existing site content without editorial changes

**Labels:** `cms`, `migration`, `content`
**Assignee:** TBD
**Blocked by:** Task 1.2

**Description**

Create an idempotent import script that copies current hard-coded names, text, contact details, statistics, navigation, and social placeholders into Sanity. Do not rewrite copy or replace external links as part of migration.

**Acceptance Criteria**

- [ ] Re-running the import updates known document IDs without creating duplicates.
- [ ] All existing non-placeholder copy is preserved exactly.
- [ ] Placeholder content is clearly identified for editor replacement rather than silently invented.
- [ ] Imported documents can be reviewed as drafts before publication.
- [ ] Credentials are supplied from the environment and are not logged.

#### Code

*Files: `scripts/import-existing-content.ts`, `package.json`*

---

#### Task 1.4 — Establish the Sanity schema-migration workflow

**Labels:** `cms`, `migration`, `operations`
**Assignee:** TBD
**Blocked by:** Task 1.2

**Description**

Add the versioned Sanity migration layout, scripts, validation commands, and runbook defined in section F. Prove the process with a harmless representative migration against a non-production dataset copy.

**Acceptance Criteria**

- [ ] Sanity migration source is versioned under `migrations/<migration-id>/` and cannot be confused with D1 SQL migrations.
- [ ] Package scripts support listing, dry-running, validating, and explicitly executing a selected migration with the pinned CLI.
- [ ] A non-production exercise covers dataset export/copy, dry run, execution, document validation, Astro build, and restore.
- [ ] The example migration is idempotent or uses a stable idempotence marker.
- [ ] The runbook requires explicit project/dataset selection and addresses published documents and drafts.
- [ ] Deprecated-field and dual-read conventions are demonstrated.

#### Code

*Files: `sanity.cli.ts`, `migrations/README.md`, `migrations/<example-id>/index.ts`, `documentation/runbooks/content-migrations.md`, `package.json`*

---

### Epic 2: Static Frontend Content Integration

**Area:** Astro public frontend
**Assignee:** TBD
**Priority:** High

---

#### Task 2.1 — Add typed build-time content queries

**Labels:** `frontend`, `cms`, `typescript`
**Assignee:** TBD
**Blocked by:** Task 1.2

**Description**

Add typed GROQ queries and one page loader. Validate required singleton data at build time and return an explicit, component-oriented model.

**Acceptance Criteria**

- [ ] Production builds query the published perspective with the pinned API version.
- [ ] Missing required documents or invalid required fields fail the build with actionable errors.
- [ ] No draft or private operational data can enter the public build.
- [ ] Queries select only fields the page needs.
- [ ] The returned page model is serializable and safe to pass from `index.astro` into the hydrated React root.
- [ ] Query/model tests cover missing singleton and empty collection behavior.

#### Code

*Files: `src/lib/content/queries.ts`, `src/lib/content/getHomePageContent.ts`, `src/lib/content/types.ts`*

```ts
// Illustrative only; use the selected Sanity typing/codegen approach.
export async function getHomePageContent(): Promise<HomePageContent> {
  const result = await sanityClient.fetch(homePageQuery, {}, {
    perspective: 'published',
  });
  return parseHomePageContent(result);
}
```

---

#### Task 2.2 — Convert the public site into a pre-rendered React SPA

**Labels:** `frontend`, `astro`, `react`, `accessibility`
**Assignee:** TBD
**Blocked by:** Tasks 1.3 and 2.1

**Description**

Load content in `index.astro`, pass the serializable page model into a pre-rendered and hydrated `ArtistApp` SPA, and convert the existing Astro sections into typed React components. React must own post-hydration navigation state and interactions without requiring full-page reloads. Replace repeated placeholder cards with mapped records while preserving layout, responsive behavior, content, and anchor semantics.

**Acceptance Criteria**

- [ ] `index.astro` loads content once and renders `<ArtistApp client:load>` with typed serializable props.
- [ ] `ArtistApp.tsx` is the public SPA root and composes `Nav`, `Hero`, `About`, `Music`, `Videos`, `Contact`, and `Footer` React components.
- [ ] `Layout.astro` continues to own the HTML document shell and metadata but no editable content.
- [ ] The old Astro section components are removed only after visual/content parity is verified.
- [ ] Navigation and interactive state update without full document reloads; section URLs remain meaningful and back/forward behavior is tested.
- [ ] No routing dependency is added for the initial single-location SPA; adopting one later requires distinct URL-addressable views and deep-link fallback design.
- [ ] The built HTML contains the primary page content before JavaScript executes, and hydration produces no mismatch warnings.
- [ ] Images have useful CMS-managed alt text and stable dimensions.
- [ ] External embeds are constructed from validated providers/IDs and lazy-loaded.
- [ ] Empty optional collections hide gracefully without empty headings or broken grids.
- [ ] Keyboard navigation, focus visibility, contrast, and mobile behavior are preserved.
- [ ] The public bundle excludes Sanity Studio/admin code and meets the agreed initial JavaScript budget.
- [ ] A production build contains the current published content.

#### Code

*Files: `src/pages/index.astro`, `src/layouts/Layout.astro`, `src/app/ArtistApp.tsx`, `src/app/components/Nav.tsx`, `src/app/components/Hero.tsx`, `src/app/components/About.tsx`, `src/app/components/Music.tsx`, `src/app/components/Videos.tsx`, `src/app/components/Contact.tsx`, `src/app/components/Footer.tsx`*

---

#### Task 2.3 — Connect publishing to Workers Builds

**Labels:** `cms`, `ci-cd`, `cloudflare`
**Assignee:** TBD
**Blocked by:** Task 2.2 and an existing Cloudflare Workers Builds Git connection

**Description**

Create a production deploy hook and configure a filtered Sanity document webhook for published content changes. Document rotation and failure diagnosis.

**Acceptance Criteria**

- [ ] Publishing, unpublishing, or updating a published relevant document requests one production build.
- [ ] Draft-only edits do not trigger production builds.
- [ ] The deploy-hook URL is stored only in provider configuration.
- [ ] A failed content build leaves the prior production deployment active.
- [ ] The runbook explains how to see webhook delivery and Workers Build status and how to rotate the hook.

#### Code

*Files: `documentation/runbooks/content-publishing.md`, `.env.example` (names only, no values)*

---

#### Task 2.4 — Implement lazy loading, SEO metadata, and structured data

**Labels:** `frontend`, `react`, `seo`, `performance`
**Assignee:** TBD
**Blocked by:** Tasks 1.2 and 2.2; final production values require the canonical domain and verified public profiles

**Description**

Implement the resource-loading and SEO contracts in section G. Ensure the public React SPA remains fully represented in pre-rendered HTML while non-critical media and third-party players are deferred.

**Acceptance Criteria**

- [ ] The confirmed LCP/hero asset loads eagerly with responsive sources, dimensions, and justified high fetch priority; no below-fold asset competes at high priority.
- [ ] Below-fold images use native lazy loading, async decoding, responsive sources, useful alt text, and reserved dimensions.
- [ ] YouTube, Spotify, SoundCloud, or other third-party players make no iframe/network request until user activation or the explicitly tested lazy threshold.
- [ ] Media facades are keyboard operable, accessible, and do not shift layout when replaced by a player.
- [ ] `Layout.astro` emits validated title, description, canonical, robots, Open Graph, Twitter/X, language, and safe JSON-LD values in the built HTML.
- [ ] `ProfilePage`/`Person` structured data contains only accurate visible CMS data and passes the selected validators.
- [ ] `@astrojs/sitemap` is installed with pnpm and configured using the canonical production `site` value.
- [ ] `astro.config.mjs` has an absolute production `site`; the sitemap contains the canonical public URL and excludes `/admin/*`, `/api/*`, previews, and error pages.
- [ ] `robots.txt` advertises the sitemap; production `/` is indexable and protected/admin/preview/error surfaces are not presented as public search results.
- [ ] Admin/Studio code is absent from public bundles and the budgets in section G.4 pass on a production-like preview.
- [ ] Automated checks inspect `dist/index.html`, sitemap, robots, canonical agreement, JSON-LD parseability, image attributes, and absence of eagerly loaded third-party iframes.

#### Code

*Files: `src/layouts/Layout.astro`, `src/app/components/ResponsiveImage.tsx`, `src/app/components/MediaFacade.tsx`, `src/app/components/Music.tsx`, `src/app/components/Videos.tsx`, `src/lib/seo.ts`, `src/pages/robots.txt.ts`, `src/pages/404.astro`, `astro.config.mjs`, `package.json`, `test/seo/build-output.test.ts`, `test/performance/resource-loading.test.ts`*

---

### Epic 3: Contact Backend and Private Data

**Area:** Worker API and D1
**Assignee:** TBD
**Priority:** High

---

#### Task 3.1 — Add Worker routing and D1 environments

**Labels:** `backend`, `cloudflare`, `d1`
**Assignee:** TBD
**Blocked by:** Cloudflare account authorization to provision D1

**Description**

Add the Worker entry point, selective API-first routing, typed bindings, separate local/preview/production database configuration, and the initial migration.

**Acceptance Criteria**

- [ ] Static asset requests retain the current asset-first behavior.
- [ ] `/api/*` reaches Worker code and unknown API routes return JSON `404`.
- [ ] Local tests cannot mutate production D1.
- [ ] Migration creates the tables, constraints, and indexes in section C.
- [ ] Binding types are generated or checked against the installed Wrangler version.
- [ ] Observability is enabled without logging personal message data.
- [ ] `pnpm build` and `pnpm exec wrangler deploy --dry-run` pass.

#### Code

*Files: `worker/index.ts`, `worker/env.ts`, `worker/router.ts`, `wrangler.jsonc`, `worker/migrations/0001_contact_inquiries.sql`, `package.json`*

---

#### Task 3.2 — Implement the protected contact submission API

**Labels:** `backend`, `security`, `turnstile`
**Assignee:** TBD
**Blocked by:** Task 3.1 and Turnstile widget provisioning

**Description**

Implement `POST /api/contact` with schema validation, body bounds, honeypot handling, server-side Turnstile verification, idempotency, abuse controls, D1 persistence, and sanitized structured logging.

**Acceptance Criteria**

- [ ] Valid input creates exactly one inquiry and creation event and returns `201`.
- [ ] Replayed idempotency keys do not create duplicate inquiries.
- [ ] Invalid fields return `422` without a D1 write.
- [ ] Invalid or missing Turnstile proof, filled honeypot, or exceeded rate controls do not create an inquiry.
- [ ] Storage failures return a generic `500` and a request ID is available for diagnosis.
- [ ] Logs contain no name, email, message, raw IP, Turnstile token, or secret.
- [ ] Unit and local D1 integration tests cover success, validation, replay, bot rejection, and database failure.

#### Code

*Files: `worker/routes/contact.ts`, `worker/lib/validation.ts`, `worker/lib/turnstile.ts`, `worker/repositories/inquiries.ts`, `worker/lib/responses.ts`, `test/worker/contact.test.ts`*

---

#### Task 3.3 — Connect the public contact form to the API

**Labels:** `frontend`, `forms`, `accessibility`
**Assignee:** TBD
**Blocked by:** Task 3.2 and Task 2.2

**Description**

Replace the simulated success path with a React-controlled form that makes a real same-origin request and uses the Turnstile widget. Preserve inputs on failure and prevent duplicate submissions while a request is pending.

**Acceptance Criteria**

- [ ] Success is shown only after an API `201` and the form resets afterward.
- [ ] Validation errors are associated with their fields and announced accessibly.
- [ ] Network/server errors preserve user input and offer a retry.
- [ ] The submit button exposes pending state and cannot double-submit.
- [ ] The form works by keyboard and at supported responsive widths.
- [ ] Contact state remains local to the React contact component unless another section has a demonstrated need to consume it.
- [ ] A privacy notice/link and confirmed retention statement are present before production activation.

#### Code

*Files: `src/app/components/Contact.tsx`, `src/app/hooks/useContactForm.ts`, `src/sanity/schemaTypes/siteSettings.ts`*

---

#### Task 3.4 — Establish the D1 forward-migration workflow

**Labels:** `backend`, `d1`, `migration`, `operations`
**Assignee:** TBD
**Blocked by:** Task 3.1

**Description**

Document and automate the additive-first D1 migration workflow from section F. Prove that a representative old Worker remains functional after an additive migration and that the new Worker handles both pre- and post-backfill records.

**Acceptance Criteria**

- [ ] D1 SQL migrations are immutable, sequential, and stored under `worker/migrations/`.
- [ ] Commands list and apply migrations using an explicit local, preview, or immutable production database target.
- [ ] Tests start from a representative pre-migration database and verify old/new Worker compatibility across the transition.
- [ ] The runbook covers pre-change bookmark/export, invariant checks, forward repair, and the approval required for Time Travel restore.
- [ ] Constraint-tightening and destructive cleanup are explicitly separated from expand/backfill releases.
- [ ] Migration output and logs contain no inquiry personal data.

#### Code

*Files: `worker/migrations/README.md`, `documentation/runbooks/d1-migrations.md`, `package.json`, `test/worker/migrations.test.ts`*

---

### Epic 4: Protected Backoffice

**Area:** Admin UI and identity
**Assignee:** TBD
**Priority:** Medium

---

#### Task 4.1 — Protect the admin surface with Cloudflare Access

**Labels:** `security`, `cloudflare-access`, `backoffice`
**Assignee:** TBD
**Blocked by:** Task 3.1, approved editor identities, and Cloudflare Zero Trust configuration authorization

**Description**

Create an Access application for `/admin/*` and `/api/admin/*`, restrict it to approved identities, and implement server-side JWT validation for the admin API.

**Acceptance Criteria**

- [ ] Anonymous users cannot load admin pages or call admin APIs.
- [ ] Only approved identities satisfy the Access policy.
- [ ] Worker verification checks JWT signature, issuer, audience, and expiry.
- [ ] Missing, invalid, or wrong-audience tokens return `401` or `403` without D1 access.
- [ ] Access configuration and recovery ownership are documented without exporting secrets.

#### Code

*Files: `worker/middleware/requireAccess.ts`, `worker/routes/admin.ts`, `documentation/runbooks/admin-access.md`*

---

#### Task 4.2 — Build the admin hub and inquiry inbox

**Labels:** `backoffice`, `frontend`, `d1`
**Assignee:** TBD
**Blocked by:** Tasks 3.1 and 4.1

**Description**

Create the `/admin` hub, protected inquiry list/detail UI, and admin API endpoints. Keep the interface deliberately small and accessible.

**Acceptance Criteria**

- [ ] The hub links clearly to Content and Inquiries.
- [ ] The inbox supports cursor pagination and status filtering.
- [ ] Full message content loads only in the detail view and is rendered as text.
- [ ] Valid status changes create an audit event containing the authenticated actor.
- [ ] Delete requires confirmation and performs soft deletion.
- [ ] Private API responses use `Cache-Control: no-store`.
- [ ] Empty, loading, stale, unauthorized, and server-error states are handled.
- [ ] Automated tests cover authentication, pagination, detail, transitions, and deletion.

#### Code

*Files: `src/pages/admin/index.astro`, `src/pages/admin/inquiries.astro`, `src/components/admin/InquiryList.tsx`, `src/components/admin/InquiryDetail.tsx`, `worker/routes/admin/inquiries.ts`, `test/worker/admin-inquiries.test.ts`*

---

#### Task 4.3 — Implement retention purge and recovery runbooks

**Labels:** `backend`, `privacy`, `operations`
**Assignee:** TBD
**Blocked by:** Task 4.2 and owner confirmation of retention policy

**Description**

Implement and document inquiry purge, D1 Time Travel recovery, CMS history recovery, and export handling. Prefer a manually invoked, reviewed command initially; automate only after the behavior is proven.

**Acceptance Criteria**

- [ ] Dry-run output reports record counts/IDs without exposing message bodies.
- [ ] Purge deletes only records that satisfy the confirmed policy.
- [ ] Production purge requires an explicit environment/target selection.
- [ ] D1 restore steps are tested against a non-production database.
- [ ] The runbook distinguishes code rollback, content rollback, and database recovery.
- [ ] Any exported personal data has an owner, purpose, secure location, and deletion date.

#### Code

*Files: `scripts/purge-inquiries.ts`, `documentation/runbooks/data-retention-and-recovery.md`, `package.json`*

---

### Epic 5: Release Readiness

**Area:** End-to-end quality and operations
**Assignee:** TBD
**Priority:** High

---

#### Task 5.1 — Add backend test tooling and end-to-end checks

**Labels:** `testing`, `backend`, `performance`, `seo`, `ci`
**Assignee:** TBD
**Blocked by:** Tasks 1.4, 2.4, 3.3, 3.4, and 4.2

**Description**

Introduce the smallest appropriate test setup for Worker handlers and local D1, document the new commands in `AGENTS.md`, and verify the primary visitor/editor workflows.

**Acceptance Criteria**

- [ ] A test script covers the principal public and admin API flows.
- [ ] Tests use local/ephemeral data and never production bindings.
- [ ] Static content build tests prove drafts are excluded and required content is enforced.
- [ ] A browser test confirms the public content is present before hydration and React hydrates without mismatch errors.
- [ ] Production-like preview checks enforce the resource, bundle, Lighthouse, metadata, structured-data, sitemap, and robots gates in section G.
- [ ] Network assertions prove third-party media players are deferred and the confirmed LCP resource is not lazy-loaded.
- [ ] A browser-level smoke test submits an inquiry and shows it in the protected inbox using test identity configuration.
- [ ] `AGENTS.md` documents any new test/type-check scripts.
- [ ] `pnpm build` and `pnpm exec wrangler deploy --dry-run` pass.

---

#### Task 5.2 — Migrate, stage, and enable production

**Labels:** `release`, `migration`, `cloudflare`
**Assignee:** TBD
**Blocked by:** Tasks 2.3, 3.3, 4.3, and 5.1

**Description**

Execute the production migration behind explicit authorization: provision bindings/secrets, publish reviewed CMS content, verify Access, deploy, submit a synthetic inquiry, and confirm publishing automation.

**Acceptance Criteria**

- [ ] Production D1 migration succeeds before code that depends on it is enabled.
- [ ] Required Wrangler secrets and build variables exist and are not printed.
- [ ] Reviewed content is published and matches the pre-migration site unless an editorial change was separately approved.
- [ ] Public pages, media, anchors, metadata, embeds, and contact submission work in production.
- [ ] Anonymous admin/API access is denied and an approved editor can use both backoffice areas.
- [ ] A CMS publish causes one successful Workers Build and updated static content.
- [ ] The synthetic inquiry is removed after verification.
- [ ] Rollback owners and commands are known before enablement.

---

## Execution Order

```text
1.1 --> 1.2 --> 1.3 --> 2.2 --> 2.3
          |                ^
          +--> 1.4         |
          +--> 2.1 --------+

{1.2, 2.2} --------------------> 2.4

3.1 --> 3.2 --> 3.3
  +----> 3.4
  +----> 4.1 --> 4.2 --> 4.3

{1.4, 2.4, 3.3, 3.4, 4.2} --> 5.1
{2.3, 3.3, 4.3, 5.1} -------> 5.2
```

- Tasks 1.1 and 3.1 can start in parallel after the architecture is approved.
- Task 4.1 can start after Task 3.1 once editor identities and the intended admin domain are known.
- Sanity migration tooling (Task 1.4) and D1 migration tooling (Task 3.4) can proceed independently after their respective foundations exist.
- Content migration and API implementation can proceed independently, but both migration workflows gate release-readiness testing.
- Production provisioning, Access policies, remote routes, and deployment require explicit authorization; planning them does not authorize those changes.

## Deployment Sequence

1. Create the Sanity project and schemas, establish the content-migration workflow, and import content as drafts.
2. Provision non-production D1 and Turnstile resources, exercise the D1 migration workflow from a representative old schema, and complete local/preview testing.
3. Merge the React SPA conversion, content integration, lazy-loading policy, and SEO output only after required content is published and section G's preview gates pass.
4. Provision production D1 and apply migrations before deploying the Worker API.
5. Configure Wrangler secrets, non-secret variables, and selective `/api/*` routing.
6. Configure Cloudflare Access before exposing `/admin/inquiries` or `/api/admin/*`.
7. Deploy the combined static assets and Worker backend; verify static routes still bypass Worker execution.
8. Enable the real contact endpoint and run one synthetic end-to-end submission.
9. Configure the Sanity-to-Workers-Builds publish webhook and test publish/unpublish behavior.
10. Monitor Worker errors, D1 writes, Turnstile rejection, Access denials, webhook/build failures, field Core Web Vitals, crawl/index coverage, sitemap status, and structured-data issues.

Rollback is split by layer:

- **Frontend/Worker code:** roll back to the prior Cloudflare Worker deployment. Do not down-migrate D1 merely to roll back code.
- **Content:** restore/re-publish the prior Sanity document revision, then trigger a new build.
- **Database:** use a forward fix when possible; use D1 Time Travel only for confirmed data corruption and follow the recovery runbook.
- **Contact form:** if persistence is unhealthy, disable submission with an honest unavailable message; never display success without a committed write.

## Definition of Done

- [ ] An approved editor can update site settings, text, tracks, videos, links, and editorial media without modifying source code.
- [ ] The public experience is a pre-rendered and hydrated React SPA at `/`; post-hydration navigation and interactions require no full-page reload while semantic section URLs continue to work.
- [ ] Critical content and the confirmed LCP resource load eagerly, while below-fold images and third-party players follow section G's lazy-loading policy without layout shifts.
- [ ] Canonical metadata, social cards, sitemap, robots policy, and valid visible-content JSON-LD are present in the static build and agree on the production URL.
- [ ] Performance, JavaScript, embed, Core Web Vitals, and SEO release gates in section G pass or have an explicitly approved measured exception.
- [ ] Draft content remains private and only published content appears in production static HTML.
- [ ] Publishing triggers a traceable build and a failed build does not replace the working site.
- [ ] A visitor can submit the contact form and receives accurate accessible feedback.
- [ ] A valid inquiry is stored once in D1, protected from public access, and visible in the authenticated inbox.
- [ ] Admin endpoints reject anonymous and invalid-token requests and do not leak personal data in logs or caches.
- [ ] Versioned Sanity and D1 migration workflows have been exercised against non-production copies, including dry run, compatibility validation, and recovery.
- [ ] Retention, deletion, content rollback, code rollback, and D1 recovery procedures are documented and tested outside production.
- [ ] Responsive design, semantic HTML, keyboard use, visible focus, alt text, and contrast are preserved.
- [ ] `pnpm build`, the added automated tests, and `pnpm exec wrangler deploy --dry-run` pass from a clean checkout.
- [ ] `git status` contains no generated `dist/`/`.astro/`, credentials, or unrelated changes.

## Explicit Non-Goals

- Migrating Astro to SSR or adding `@astrojs/cloudflare` for the initial release.
- Adding a client routing library or multiple public route views before the SPA has distinct URL-addressable view requirements and a deep-link fallback design.
- Building a general drag-and-drop page builder.
- Reimplementing CMS authentication, drafts, history, rich-text editing, or media transforms.
- Storing private inquiries in a public CMS dataset.
- Building a CRM, newsletter platform, user account system, booking engine, or payment system.
- Sending automated email replies or marketing messages.
- Hosting original video/audio masters; the initial model links to established media platforms.
- Changing existing names, contact details, biography, or external links during technical migration.
- Changing remote routes, domains, bindings, or Cloudflare resources without explicit authorization.
- Adding R2 before a concrete non-CMS object-storage requirement exists.

## Open Decisions Before Implementation

1. Confirm Sanity as the selected managed CMS and accept its plan/vendor constraints.
2. Identify the editor email identities and identity provider used by Cloudflare Access.
3. Confirm whether the public contact email remains visible on the site.
4. Confirm the inquiry retention period and obtain any required privacy/legal review.
5. Confirm whether production content publishes should deploy automatically or require an editor-operated “Deploy” action.
6. Confirm whether inquiry email notifications are required; they are not included in the base scope.
7. Confirm the canonical production domain and the public social/profile URLs permitted in `sameAs` structured data.

## Primary References

- [Sanity's official Astro integration](https://www.sanity.io/docs/astro)
- [Astro's official React integration](https://docs.astro.build/en/guides/integrations-guide/react/)
- [Astro framework components and hydration](https://docs.astro.build/en/guides/framework-components/)
- [Astro sitemap integration](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
- [Google JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google ProfilePage structured data](https://developers.google.com/search/docs/appearance/structured-data/profile-page)
- [Core Web Vitals](https://web.dev/articles/vitals)
- [MDN lazy-loading guidance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Lazy_loading)
- [Sanity static rendering and rebuild guidance](https://www.sanity.io/docs/astro/static-and-server-rendering)
- [Sanity webhook documentation](https://www.sanity.io/docs/content-lake/webhooks)
- [Sanity schema and content migrations](https://www.sanity.io/docs/content-lake/schema-and-content-migrations)
- [Sanity migration safety considerations](https://www.sanity.io/docs/content-lake/important-considerations-for-schema-and-content-migrations)
- [Cloudflare Workers Static Assets bindings and selective `run_worker_first`](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare Workers Builds deploy hooks](https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Cloudflare Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
