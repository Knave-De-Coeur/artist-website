# Backend, CMS, and Backoffice — Implementation Plan

> Add an SEO-friendly React single-page application, a Cloudflare-native content backoffice, and a secure data backend while keeping the initial public view statically pre-rendered and fast.
>
> **Status:** In progress
> **Repository:** `artist-website`
> **Last updated:** 2026-10-30

---

## Overview

The current site is a single statically generated Astro page. Site copy, navigation, contact details, social links, music, and video placeholders are hard-coded in Astro components. The contact form only displays a success message in the browser; it does not submit or persist data. `wrangler.jsonc` deploys `dist/` as Workers Static Assets and has no Worker entry point, database, object storage, authentication, or administrative interface.

The proposed system keeps Astro in static-output mode and uses it to pre-render the initial document for a React single-page application (SPA) at `/`. React owns the public UI after hydration, while Astro preserves crawlable HTML and build-time metadata. A Hono application on Cloudflare Workers owns all application APIs, Chanfana generates and validates their OpenAPI contracts from Zod schemas, D1 stores both public-content records and private operational records in explicitly separated tables, and R2 stores editorial media. The repository owns the schemas, migrations, API contracts, and backoffice code.

The backoffice is a separate React-admin application under `/admin`. Cloudflare Access protects `/admin/*` and `/api/admin/*`; the Worker also verifies the authenticated Access identity before any administrative database or media operation. Saving creates drafts and immutable revision records. Publishing atomically promotes validated content to the published representation and triggers a Cloudflare Workers Build through a deploy hook. The Astro build reads only the public published-content endpoint. Public static assets continue to bypass Worker code; only `/api/*`, `/admin/*` SPA fallback requests, and selected media delivery/transformation routes run Worker-first.

```text
Editor
  |
  +--> Cloudflare Access --> /admin React-admin --> Worker admin API
                                                        |       |
                                                        |       +--> R2 media
                                                        v
                                                     D1 drafts,
                                                     published data,
                                                     revisions, inquiries
                                                        |
                                                        +--> publish action
                                                               |
                                                               v
                                                    Cloudflare Workers Build
                                                               |
                                                               v
                                                     Astro static deployment

Visitor --> Astro-pre-rendered React SPA at `/` --> React hydration/client runtime
        --> POST /api/contact --> validation + Turnstile --> D1
```

### Current-State Gaps

| Area | Current state | Required state |
|---|---|---|
| Site content | Hard-coded across `src/components/*.astro` | Typed D1 records with drafts, revisions, and explicit publication |
| Public UI architecture | Separate Astro section components with local scripts | One typed React SPA, pre-rendered by Astro and hydrated at `/` |
| Loading strategy | No production media yet; no explicit critical/lazy policy | Eager critical content, lazy below-fold media, click-to-load third-party embeds, and enforced bundle budgets |
| Search visibility | Static title/description only; no canonical, social metadata, structured data, sitemap, or robots policy | Complete server-rendered SEO metadata, crawl controls, structured data, sitemap, and validation workflow |
| Site settings | Title, metadata, contact details, navigation, and social URLs are code | Singleton settings editable without a code change |
| Media | Placeholder blocks and comments | R2-backed managed images with metadata, alt text, and optimized delivery |
| Contact form | Client-only fake success | Validated, spam-protected API with durable storage and honest UI states |
| Backoffice | None | Authenticated content editor and inquiry inbox |
| Publishing | Only source-control deployments | Content publish triggers a controlled static rebuild |
| Private data | No data store | D1 schema, retention, access control, audit trail, and recovery procedure |
| Schema evolution | No persisted schemas or migration process | Immutable D1 migrations and versioned content transforms with compatibility and rollback gates |
| Environments | One implicit production configuration | Local, preview, and production configuration with separate data boundaries |
| Testing | Task 1.1 establishes Vitest in the Workers runtime | Extend local D1/R2 API coverage through browser-level and production-like release checks |

### Recommendation: Own the Data and Build on Cloudflare

Use **React-admin** as the browser-side backoffice framework, not as a hosted CMS. Implement a custom same-origin Worker API over D1 and R2. This retains reusable CRUD, form, filtering, and routing primitives without delegating content ownership, authentication, storage, migrations, or publishing behavior to a CMS vendor.

| Option | Fit | Advantages | Costs and risks | Decision |
|---|---|---|---|---|
| React-admin + Worker + D1 + R2 | High | Own data and contracts; one Cloudflare runtime; reusable admin UI primitives; static Astro remains intact | We own drafts, revisions, publication, media, API security, and migrations | **Recommended** |
| Payload on Workers + D1 + R2 | Medium | Complete open-source CMS, authentication, media, drafts, and generated APIs | Separate Next.js application, large Worker bundle, paid Workers requirement, and a second framework/runtime | Reconsider if scope becomes multi-site or workflow-heavy |
| StudioCMS | Low to medium | Astro-native dashboard and configurable SQL storage | Requires SSR and currently does not use D1 as its native database path | Does not match the static architecture |
| Directus or Strapi | Medium | Mature administration UI and owned database | Requires a persistent service/container outside this Worker deployment | Use only if operating a separate backend becomes acceptable |
| Git-based CMS | Medium | Portable content and Git history | Content publication creates repository activity and media workflows are less direct | Viable alternative, not selected |

React-admin must remain replaceable. The Worker API, shared schemas, and D1/R2 data model are the system contracts; the admin UI is one client of those contracts.

### Key Concepts

- **Published content:** Public, non-sensitive D1 records exposed through the published-content API and read by Astro during a build.
- **Draft content:** Validated editor work stored separately from the published representation until an explicit publish action.
- **Operational data:** Private visitor-generated records such as contact inquiries. It is stored in separate D1 tables and never exposed through the public content API or generated HTML.
- **Static publication:** A content publish requests a fresh build. If the build fails, the prior production deployment remains live.
- **Backoffice:** The Access-protected React-admin application for content, media, publishing, and inquiries.
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
| Backoffice framework | React-admin open-source core | Supplies CRUD/form primitives while keeping the API and data source under project control |
| Record store | Cloudflare D1 | Content, revisions, audit events, and inquiries are relational, low-volume, and naturally accessed through a Worker binding |
| Media store | Cloudflare R2 | Project-owned, S3-compatible object storage accessed through the Worker; metadata and alt text remain in D1 |
| Dynamic runtime | Add one Worker entry point to the existing deployment | The requested backend intentionally extends the assets-only Worker; selective `run_worker_first` keeps static requests on the asset path |
| Worker HTTP framework | Hono | Supplies a typed, Workers-native middleware and routing foundation without changing Astro's static rendering model |
| API contract layer | Chanfana over Hono with shared Zod schemas | Generates OpenAPI 3.1 contracts and request validation without maintaining a second schema definition or adding the overlapping `@hono/zod-openapi` package |
| Worker tests | Vitest with `@cloudflare/vitest-plugin` | Runs handler, D1, and R2 tests inside the Workers runtime with isolated local bindings |
| Admin authentication | Cloudflare Access for `/admin/*` and `/api/admin/*` | Avoids writing password, session, recovery, and MFA flows; admin APIs validate the Access identity/JWT |
| Public form protection | Server-side validation, Turnstile, rate controls, honeypot, and generic errors | Reduces automated abuse and prevents trusting client-side checks |
| Publication | Worker publish transaction followed by a Cloudflare Workers Builds deploy hook | Published content becomes static output without converting Astro to SSR |
| Content model | Fixed, typed sections rather than a general page builder | The site is a single designed page; unconstrained blocks would add complexity and permit broken layouts |
| Secrets | Wrangler secrets and provider dashboards only | No Turnstile secrets, deploy-hook URLs, or Access credentials are committed |
| Data minimization | Do not persist raw IP addresses or Turnstile tokens | The inbox needs the message and reply details, not unnecessary security telemetry |
| Retention | Default inquiry retention of 24 months, configurable after owner/privacy review | Gives an explicit deletion policy; this is a product policy, not legal advice, and must be confirmed before launch |
| Content storage shape | Typed JSON payloads plus relational lifecycle metadata | Keeps the small fixed content model evolvable while D1 enforces identity, state, revisions, and relationships |
| Future migrations | Expand–migrate–contract with immutable D1 migrations and versioned transforms | Prevents a schema deployment from making existing content, older code, or in-flight requests unreadable |

### Development Approach

Deliver this in additive stages. First establish the Hono/Chanfana Worker, Workers-runtime Vitest setup, and local D1/R2 foundations without changing production rendering. Next add the shared Zod schemas and persistence layer, then implement the protected admin API and React-admin content/media workflows, import the existing content as drafts, and prove publication into a stable public content contract. Then add the typed build-time loader and convert the public experience to one hydrated React SPA after visual parity is proven. The contact backend and inquiry UI can proceed in parallel once the Worker/D1 foundation exists. Each stage must keep the existing static deployment buildable, and production enablement is a separate, explicit action.

---

## A. Target Architecture

### A.1 Request Routing

The existing Worker continues to own `dist/`. Add a Worker module and configure the assets binding so API routes, admin SPA fallback routes, and selected media routes execute code first. Normal public pages and assets remain asset-first.

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
    "run_worker_first": ["/api/*", "/admin", "/admin/*", "/media/*"],
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
  "r2_buckets": [
    {
      "binding": "MEDIA",
      "bucket_name": "artist-website-production-media"
    }
  ],
  "observability": {
    "enabled": true
  }
}
```

The Worker exports a typed Hono application. Chanfana registers documented API endpoints beneath `/api`, serves the generated OpenAPI 3.1 contract, and uses the same Zod schemas as runtime validation. The Worker must return API responses for known `/api/*` routes and JSON `404` for unknown API routes. It must not turn missing API paths into HTML. Authenticated `/admin/*` navigation that does not identify a real asset serves `/admin/index.html` so React-admin browser routes can reload safely. Media routes return only validated R2 objects or transformations with explicit caching. All other static assets bypass Worker execution.

### A.2 Components and Ownership

| Component | Responsibility | Data classification |
|---|---|---|
| Astro | Fetch published content at build time, own the document shell/metadata, and pre-render the React root | Public |
| React public app | Render navigation and all portfolio sections at `/`; own browser interactions and shared page state | Public |
| React-admin backoffice | Content/media forms, publication controls, revision history, and inquiry workflow | Restricted editor surface |
| Cloudflare Worker | Published content, contact submission, media, and protected admin APIs | Mixed; explicit route boundary |
| D1 | Draft/published content, revisions, audit events, inquiries, and status history | Mixed; explicit table/API boundaries |
| R2 | Original editorial media objects | Public only through controlled delivery; writes restricted |
| Cloudflare Access | Permit approved identities to reach admin pages/APIs | Authentication metadata |
| Workers Builds | Rebuild and deploy static output after content publish | Build metadata |
| Turnstile | Bot signal for public form submissions | Ephemeral verification data |

### A.3 Environment Boundaries

| Environment | D1 | R2 | Worker configuration |
|---|---|---|---|
| Local | Wrangler local D1 | Wrangler local R2 | `.dev.vars` for local secrets; never committed |
| Preview | Dedicated preview D1 binding | Dedicated preview bucket or isolated prefix | Preview-specific Access audience, Turnstile test keys, and bindings |
| Production | Production D1 | Production media bucket | Production secrets and Access application |

Do not point local destructive tests or preview deployments at production D1 or R2. Preview publication must never trigger the production deploy hook. Production resource creation, binding changes, routes, Access policies, and deployment require explicit authorization.

### A.4 SEO-Friendly React SPA

`src/pages/index.astro` remains the build-time boundary. It loads and validates published content from the Worker API, supplies document metadata through `Layout.astro`, and passes a serializable page model into the React SPA. Astro renders the initial HTML; after hydration, React handles public interactions without document reloads.

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
- Fetch published content only during the Astro build. Do not expose build credentials or refetch the whole page model in the browser.
- Keep local UI state close to the owning React component. Do not add a global state library until cross-section state is substantial enough to justify it.
- The React-admin application remains a separate `/admin/*` route chunk and is not bundled into the public React application.
- Set an initial JavaScript budget and inspect the built client chunks. The React conversion must not silently pull React-admin, Material UI, or admin dependencies into the public bundle.
- Keep all headings, biography, track/video titles, links, and contact information in pre-rendered HTML. Lazy loading may defer media bytes and interactive controls, not discoverable text content.

---

## B. Content and Settings Model

Contracts below are proposed and should be defined once under `src/lib/content/schema.ts` with Zod. The Worker, Chanfana routes, import scripts, admin forms, published-content API, and Astro build loader use the same inferred types. Persisted payloads carry a `schemaVersion` so transforming migrations can be explicit and restartable.

```ts
interface ManagedImage {
  assetId: string;
  objectKey: string;
  alt: string;
  width: number;
  height: number;
  mimeType: string;
  focalPoint?: { x: number; y: number };
}
```

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

- Enforce the stable singleton key `siteSettings` in the Worker repository layer.
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
    portrait?: ManagedImage;
    bodyHtml: string;
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
  artwork?: ManagedImage;
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
  thumbnail?: ManagedImage;
  featured: boolean;
  sortOrder: number;
}
```

Store provider and validated ID rather than an arbitrary iframe. Build the embed URL in code, use a restricted `allow` list, lazy-load embeds, and retain a text title for accessibility.

### B.5 Persistence and Publication Contract

The initial implementation uses a shared content-document table with typed JSON payloads and relational lifecycle metadata. This avoids a wide SQL migration for every editorial field while preserving strict validation at every read/write boundary.

```sql
CREATE TABLE content_documents (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL
    CHECK (content_type IN ('siteSettings', 'homePage', 'track', 'video')),
  publication_state TEXT NOT NULL DEFAULT 'never_published'
    CHECK (publication_state IN ('never_published', 'published', 'archived')),
  schema_version INTEGER NOT NULL,
  draft_json TEXT NOT NULL,
  published_json TEXT,
  sort_order INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  published_at TEXT,
  published_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  published_version INTEGER
);

CREATE UNIQUE INDEX idx_content_singletons
  ON content_documents(content_type)
  WHERE content_type IN ('siteSettings', 'homePage');

CREATE TABLE content_revisions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('created', 'saved', 'published', 'restored', 'archived')),
  schema_version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES content_documents(id),
  UNIQUE (document_id, version)
);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  checksum TEXT NOT NULL,
  alt_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  deleted_at TEXT
);
```

Rules:

- Saving validates and updates only `draft_json`, increments `version`, and appends a revision in one transaction. A previously published record remains public at its prior `published_version`.
- Publishing revalidates the complete aggregate, copies `draft_json` to `published_json`, sets `published_version = version`, records a publication revision, then triggers the deploy hook after commit.
- The UI derives unpublished changes from `published_version IS NULL OR version > published_version`; publication state must not collapse draft and published state into one ambiguous flag.
- A failed build does not roll back D1 publication; the prior static deployment remains live and the backoffice reports the failed/pending publication state.
- Restoring copies an immutable revision into a new draft version; revision rows are never edited in place.
- Singleton types have stable IDs. Repeatable records use opaque UUIDs and explicit `sort_order`.
- Rich text is a constrained allow-listed HTML subset produced by TipTap and sanitized on the Worker before storage and again before rendering. Arbitrary scripts, styles, iframes, and event attributes are rejected.

### B.6 Published Content API and Build Contract

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

`GET /api/content/home` returns only validated `published_json` records and media metadata. It contains no drafts, revision metadata, editor identities, or private operational data. The response carries an ETag and a content-version identifier.

Production builds fetch this endpoint from the currently deployed Worker using an explicit `CONTENT_API_BASE_URL`. A network failure, missing singleton, unsupported schema version, or invalid payload fails the new build, leaving the previous deployment live; the build must not silently publish empty sections. Local builds may use Wrangler local development or an explicit checked-in test fixture, but production must never fall back to fixture content.

---

## C. Worker API and Operational Data

### C.1 D1 Schema

Proposed migration `worker/migrations/0002_contact_inquiries.sql`, after the content/media foundation migration:

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
| `GET /api/admin/session` | Return the validated Access identity and allowed capabilities |
| `GET/POST /api/admin/content/:type` | List or create typed content records |
| `GET/PUT/DELETE /api/admin/content/:type/:id` | Read, save a draft, or archive a content record with optimistic concurrency |
| `GET /api/admin/content/:type/:id/revisions` | List immutable revision metadata |
| `POST /api/admin/content/:type/:id/restore` | Restore a selected revision into a new draft |
| `POST /api/admin/content/publish` | Validate and publish the complete content aggregate, then request a build |
| `GET/POST /api/admin/media` | List metadata or upload an allow-listed image to R2 |
| `DELETE /api/admin/media/:id` | Soft-delete an unreferenced media object after confirmation |
| `GET /api/admin/inquiries?status=&cursor=&limit=` | Cursor-paginated, newest-first list |
| `GET /api/admin/inquiries/:id` | Inquiry detail and event history |
| `PATCH /api/admin/inquiries/:id` | Change status using an allow-listed transition |
| `DELETE /api/admin/inquiries/:id` | Soft-delete after explicit confirmation |

Mutation endpoints require the current record version and reject stale writes with `409`. Content and media writes validate type, size, references, and ownership server-side; UI validation is only a convenience. List results should omit full inquiry messages until detail is requested. Set `Cache-Control: no-store` on all private responses. Record the validated Access identity email on content, media, status, and deletion events. Do not put content bodies, message bodies, or email addresses in application logs.

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
| `/admin` | React-admin dashboard with publication state, Content, Media, and Inquiries | Cloudflare Access |
| `/admin/content/*` | Settings, home page, tracks, videos, drafts, and revision history | Cloudflare Access plus Worker verification |
| `/admin/media` | R2 media library, upload, alt text, and usage status | Cloudflare Access plus Worker verification |
| `/admin/inquiries/*` | Search/filter list, detail view, and status controls | Cloudflare Access plus Worker verification |

React-admin supplies browser-side CRUD and form primitives through a custom `dataProvider`; it is not a security boundary. The Worker verifies Access and authorizes every operation. Admin routes are separate chunks and must not increase the public SPA bundle.

### D.2 Content Workflow

1. Editor signs in through Cloudflare Access and edits a typed draft form.
2. React-admin provides immediate form feedback; the Worker repeats authoritative validation and applies optimistic concurrency.
3. The Worker stores the draft and immutable revision without changing the published representation.
4. The editor selects Publish; the Worker validates the complete site aggregate and atomically promotes the relevant draft representations.
5. After commit, the Worker calls the secret Workers Builds deploy-hook URL and records the publication/build request identifier when available.
6. Astro fetches only the public published-content endpoint and creates `dist/`.
7. Build and Wrangler deployment checks pass; the new static deployment becomes active.
8. On failure, the previous deployment stays active, published D1 data remains available for retry, and the backoffice exposes a retry action.

The deploy-hook URL is a credential. Store it as a Wrangler secret, never in D1, source, logs, or client-side code, and rotate it if exposed. Saving drafts must not trigger builds.

### D.3 Inquiry Workflow

```text
new --> read --> replied --> archived
  \                |
   +---------------+

any non-deleted state --> soft-deleted --> purged by retention process
```

The inbox is intentionally not a general CRM. It supports reviewing, replying through the operator's normal email client, tracking state, and deleting records. Email delivery, campaigns, customer accounts, and sales pipelines are outside this plan.

### D.4 Static Preview Limitation

The initial implementation does not add SSR solely for visual draft preview. Editors review field values and media in the backoffice, then publish to trigger a static build. If click-to-edit visual preview becomes necessary, assess an Access-protected preview route or isolated preview deployment as a separate project.

---

## E. Configuration and Security Reference

### E.1 Configuration Inventory

| Name | Kind | Used by | Secret |
|---|---|---|---|
| `CONTENT_API_BASE_URL` | Build variable | Astro build-time loader | No |
| `PUBLIC_TURNSTILE_SITE_KEY` | Build variable | Contact form | No |
| `TURNSTILE_SECRET_KEY` | Wrangler secret | Public contact API | Yes |
| `ACCESS_TEAM_DOMAIN` | Worker variable | Access JWT verifier | No |
| `ACCESS_AUD` | Worker variable | Access JWT verifier | Treat as configuration, not authentication by itself |
| `IP_HASH_SECRET` | Wrangler secret | Optional abuse hash | Yes |
| `DB` | D1 binding | Worker | Binding |
| `MEDIA` | R2 binding | Worker media API | Binding |
| `DEPLOY_HOOK_URL` | Wrangler secret | Publish automation | Yes |

The published-content API is intentionally public and contains only data already eligible for the public site. Drafts, revisions, editor identities, media writes, and operational records are available only through authenticated admin endpoints.

### E.2 Security Controls

- Validate all input on the Worker even when the browser validates it.
- Enforce JSON content type, body-size limits, length limits, and normalized string values.
- Verify Turnstile tokens server-side and reject replay according to current product guidance.
- Apply rate controls by endpoint and coarse client signal without retaining raw addresses.
- Validate Access JWT signature, issuer, audience, and expiry for admin APIs.
- Use parameterized D1 statements only.
- Require optimistic-concurrency versions on content writes and return `409` for stale edits.
- Allow-list media MIME types, verify file signatures, cap dimensions/bytes, use generated object keys, and never trust the uploaded filename as a path.
- Sanitize rich text on write and render; reject scripts, event handlers, arbitrary iframes, styles, and unsafe URL schemes.
- Escape output by default and never render inquiry messages as HTML.
- Apply `no-store`, `X-Content-Type-Options: nosniff`, and an appropriate admin Content Security Policy.
- Keep CORS same-origin; do not use `*` for private or mutation endpoints.
- Log request IDs, route, status, latency, and error category—not visitor message content or email.

---

## F. Future Schema and Data Migrations

Persisted data must be treated as a versioned contract. Changing a TypeScript interface, runtime validator, JSON payload, API projection, or D1 table definition does not by itself update existing records. Every change to a persisted shape requires a migration assessment in the merge request, even when the conclusion is “additive; no backfill required.”

### F.1 Change Classification

| Change type | Examples | Required approach |
|---|---|---|
| Additive | Optional content field, nullable D1 column, new document/table | Add first; deploy compatible readers; backfill only if the product requires a value |
| Transforming | Field rename, string-to-array, data normalization, table split | Dual-read old/new shapes, run a versioned idempotent migration, validate, then remove legacy support later |
| Constraint tightening | Required field, unique index, smaller length limit, stricter enum | Audit and repair existing data before enabling the constraint or validation |
| Destructive | Drop field/table, delete content type, rewrite stable IDs or R2 object keys | Export/backup, prove no readers or references remain, require explicit approval, and perform cleanup in a separate release |

Do not combine an irreversible cleanup with the release that first introduces the replacement shape. The previous deployed code must remain able to operate throughout the migration window.

### F.2 Standard Expand–Migrate–Contract Sequence

```text
Assess --> Back up --> Expand storage/schema --> Deploy dual-compatible readers
   --> Dry-run migration --> Migrate production --> Validate invariants
   --> Switch writers/readers --> Observe --> Contract in a later release
```

1. Document the before/after shape, affected records, compatibility window, invariants, estimated duration, and recovery method.
2. Create a restorable pre-change state: a verified D1 Time Travel bookmark plus an export when the risk justifies longer-lived recovery, and an R2 inventory/export for destructive media operations.
3. Add the new field/table/shape without removing the old one.
4. Deploy code that can read both shapes and continues writing a shape compatible with the old deployment. For a rename, use a fallback such as `coalesce(newField, oldField)` at the query/model boundary.
5. Run the migration against a non-production copy or local database, then run its dry-run mode against the intended target.
6. Review affected counts, sample records, validation output, dangling references, nullability, uniqueness, and application build results.
7. Execute against production using an explicit database/bucket target; never rely only on a mutable binding alias.
8. Re-run validation and the principal public/admin flows. Record migration ID, target, time, operator, counts, and outcome without logging private record contents.
9. After a defined observation window, stop writing the old shape and remove fallback reads.
10. Remove deprecated fields/columns only in a later, separately approved migration. Prefer a forward repair over a destructive down migration.

### F.3 Content Payload Migration Rules

- Every persisted payload includes `schemaVersion`; readers reject unknown future versions and support explicitly documented older versions during the compatibility window.
- Store versioned TypeScript transforms under `worker/content-migrations/<from>-to-<to>.ts`. A transform accepts a parsed old payload and produces a payload that passes the new runtime schema.
- Migration commands support dry-run, explicit target selection, bounded batches, restart markers, affected/failed counts, and validation without logging content bodies.
- Intentionally decide whether a transform applies to drafts, published values, revision snapshots, or all three. Historical revision snapshots should normally remain immutable and be upgraded only when read.
- Preserve stable document IDs, revision numbers, media asset IDs, and references. Never overwrite the only published representation during a transformation without a restorable pre-change state.
- Keep the Astro loader and Worker API compatible with both versions until every current draft and published payload has been validated or migrated.
- Rich-text migrations sanitize the result under the new allow list and report records that would lose unsupported markup for manual review.

Illustrative compatibility reader:

```ts
// Illustrative only.
export function readSiteSettings(stored: unknown): SiteSettings {
  const versioned = storedContentEnvelope.parse(stored);
  if (versioned.schemaVersion === 1) {
    return siteSettingsV2.parse({
      ...versioned.data,
      artistTagline: versioned.data.shortDescriptor,
    });
  }
  return siteSettingsV2.parse(versioned.data);
}
```

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
| React-admin code | Separate route chunk | Must never appear in the public `/` bundle |
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

The media mapper must retain R2 object identity and intrinsic dimensions and generate constrained responsive sources. Do not ship a single original-resolution image to every device. Image transformations must preserve focal-point intent and should prefer AVIF/WebP with a supported fallback. The initial implementation may generate build-time variants; adding the Cloudflare Images binding requires a measured need and pricing review.

### G.2 SEO Contract

`Layout.astro` owns deterministic, server-rendered head metadata. The content model supplies editable values but cannot emit arbitrary head HTML.

Required output for `/`:

- One descriptive `<title>` and meta description, with build-time validation for missing/empty values.
- Absolute canonical URL derived from the configured production `site` URL, not from an untrusted request header.
- Open Graph `og:type`, `og:title`, `og:description`, `og:url`, and crawlable `og:image` with known dimensions and alt text.
- Twitter/X card metadata using the same validated title, description, and image.
- Correct `<html lang>`, one meaningful `<h1>`, hierarchical headings, semantic landmarks, and crawlable `<a href>` links.
- `robots` set to index/follow for production `/`; preview, admin, and error surfaces must not be included in the sitemap and must be protected or marked `noindex` as appropriate.
- A generated XML sitemap containing the canonical public URL and a `robots.txt` that points to it. The `site` value in `astro.config.mjs` is required.
- JSON-LD using `ProfilePage` with a `Person` as `mainEntity`, populated only from visible, accurate published content such as name, description, portrait, canonical URL, and verified `sameAs` profiles.
- `VideoObject` markup only when every required property is available and the visible page actually presents that video. Do not generate speculative or incomplete structured data.
- A useful static 404 response with `noindex`; API/admin responses are excluded from public indexing.

The canonical URL, Open Graph URL, sitemap entry, and JSON-LD entity URL must agree. Structured data is serialized with a safe JSON serializer and validated in Google's Rich Results Test before production release. Search-result enhancements are eligibility signals, not guaranteed outcomes.

### G.3 Backoffice Fields and Validation

Extend `siteSettings` with a dedicated SEO object while preserving the fields already proposed in section B:

```ts
interface SeoSettings {
  title: string;
  description: string;
  shareImage: ManagedImage;
  canonicalPath: '/';
  person: {
    name: string;
    description: string;
    image?: ManagedImage;
    sameAs: string[];
  };
}
```

Shared runtime validation and the Worker reject missing required SEO values, non-HTTPS external profiles, duplicate `sameAs` URLs, and share images without alt text or sufficient source dimensions. Preview/admin controls must not allow an editor to accidentally index a non-production environment.

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

### Epic 1: Cloudflare Content Platform Foundation

**Area:** Worker, D1, R2, and content model
**Assignee:** TBD
**Priority:** High

---

#### Task 1.1 — Add the Hono Worker, API contract, tests, and local D1/R2 foundations

**Labels:** `backend`, `cloudflare`, `d1`, `r2`
**Assignee:** TBD
**Blocked by:** None for local implementation; Cloudflare authorization for remote resources

**Description**

Add the Hono Worker entry point, Chanfana OpenAPI foundation, selective API-first routing, typed bindings, Workers-runtime Vitest setup, local D1 and R2 development resources, and separate preview/production configuration. Preserve Astro static output and asset-first routing.

**Acceptance Criteria**

- [ ] Public static assets retain asset-first behavior; only `/api/*`, `/admin/*` SPA fallback, and explicitly selected media routes execute Worker code first.
- [ ] The Worker exports a typed Hono application and uses Chanfana as its single OpenAPI/validation layer over shared Zod schemas.
- [ ] `GET /api/health` is represented in the generated OpenAPI 3.1 contract and returns a schema-valid response.
- [ ] Unknown API paths return JSON `404` and never fall back to `index.html`.
- [ ] `DB`, `MEDIA`, and `ASSETS` bindings are typed and have isolated local/preview/production targets.
- [ ] Local development and tests cannot mutate production D1 or R2.
- [ ] Vitest executes inside the Workers runtime and covers routing, the OpenAPI contract, logging redaction, and local D1/R2 bindings.
- [ ] Observability omits content bodies, inquiry data, secrets, and raw uploaded bytes.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm exec wrangler deploy --dry-run` pass.

#### Code

*Files: `worker/index.ts`, `worker/routes/health.ts`, `test/worker/app.test.ts`, `vitest.config.ts`, `worker-configuration.d.ts`, `wrangler.jsonc`, `.dev.vars.example`, `package.json`, `AGENTS.md`*

```ts
// Illustrative only.
const app = new Hono<{ Bindings: Env }>();
const api = fromHono(new Hono<{ Bindings: Env }>(), { base: '/api' });
api.get('/health', HealthEndpoint);
app.route('/', api);
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));
```

---

#### Task 1.2 — Implement shared content schemas and D1 persistence

**Labels:** `backend`, `content-model`, `d1`, `typescript`
**Assignee:** TBD
**Blocked by:** Task 1.1

**Description**

Implement the shared runtime schemas, content/media/revision tables, repositories, publication lifecycle metadata, and optimistic-concurrency contract from section B.

**Acceptance Criteria**

- [ ] One set of runtime schemas produces the TypeScript types used by Worker, scripts, admin, and Astro.
- [ ] Settings, home page, track, video, managed-image, and SEO validation match sections B and G.
- [ ] Migration `0001` creates content, revision, publication, and media metadata structures with required indexes and constraints.
- [ ] Singleton IDs, opaque repeatable IDs, revision uniqueness, and stale-version rejection are enforced server-side.
- [ ] Draft saves and publication revisions are atomic and tested against local D1.
- [ ] Rich text is constrained and sanitized at the authoritative Worker boundary.

#### Code

*Files: `src/lib/content/schema.ts`, `worker/repositories/content.ts`, `worker/repositories/media.ts`, `worker/migrations/0001_content_platform.sql`, `test/worker/content-repository.test.ts`*

---

#### Task 1.3 — Implement content/media APIs and import existing content

**Labels:** `backend`, `content`, `r2`, `migration`
**Assignee:** TBD
**Blocked by:** Task 1.2

**Description**

Implement the published-content and protected content/media API contracts, then add an idempotent import that copies current hard-coded content into D1 drafts without editorial changes. Import real media only when source assets exist; preserve explicit placeholders otherwise.

**Acceptance Criteria**

- [ ] `GET /api/content/home` returns only complete validated published records and never exposes drafts, revisions, or editor identities.
- [ ] Protected content APIs support list/read/create/save/archive/revisions/restore with server-side validation and optimistic concurrency.
- [ ] Media upload verifies MIME signature, size, dimensions, checksum, object key, and alt text before committing D1 metadata.
- [ ] Re-running the import updates stable known IDs without creating duplicates.
- [ ] All existing non-placeholder copy and links are preserved exactly.
- [ ] Placeholder content is clearly identified for editor replacement rather than silently invented.
- [ ] Imported records remain drafts until an explicit publish operation.
- [ ] API and import tests prove that credentials, content bodies, and editor identities are not logged or leaked.

#### Code

*Files: `worker/routes/content.ts`, `worker/routes/admin/content.ts`, `worker/routes/admin/media.ts`, `worker/lib/content-validation.ts`, `scripts/import-existing-content.ts`, `package.json`*

---

#### Task 1.4 — Establish D1 and content-payload migration workflows

**Labels:** `d1`, `migration`, `content`, `operations`
**Assignee:** TBD
**Blocked by:** Task 1.2

**Description**

Add the immutable D1 migration workflow and versioned JSON payload transforms from section F. Prove both with harmless representative migrations against local/non-production data.

**Acceptance Criteria**

- [ ] D1 migrations are immutable, sequential, and stored only under `worker/migrations/`.
- [ ] Payload transforms are versioned under `worker/content-migrations/` and cannot be confused with D1 SQL migrations.
- [ ] Commands list, dry-run, validate, and explicitly execute migrations against local, preview, or immutable production targets.
- [ ] A non-production exercise covers export/bookmark, dry run, execution, draft/published validation, Astro build, and restore.
- [ ] The example transform is idempotent or safely restartable and demonstrates dual-version reads.
- [ ] Migration logs report IDs/counts without content bodies, media bytes, or inquiry personal data.

#### Code

*Files: `worker/migrations/README.md`, `worker/content-migrations/README.md`, `worker/content-migrations/1-to-2.ts`, `documentation/runbooks/data-migrations.md`, `package.json`, `test/worker/migrations.test.ts`*

---

### Epic 2: Static Frontend Content Integration

**Area:** Astro public frontend
**Assignee:** TBD
**Priority:** High

---

#### Task 2.1 — Add the typed build-time published-content loader

**Labels:** `frontend`, `api`, `typescript`
**Assignee:** TBD
**Blocked by:** Task 1.3

**Description**

Add one loader over `GET /api/content/home`. Validate the response and supported schema version at build time and return an explicit, component-oriented model.

**Acceptance Criteria**

- [ ] Production builds use the explicit `CONTENT_API_BASE_URL` and consume only the public published representation.
- [ ] Missing required documents or invalid required fields fail the build with actionable errors.
- [ ] No draft or private operational data can enter the public build.
- [ ] Queries select only fields the page needs.
- [ ] The returned page model is serializable and safe to pass from `index.astro` into the hydrated React root.
- [ ] Query/model tests cover missing singleton and empty collection behavior.

#### Code

*Files: `src/lib/content/queries.ts`, `src/lib/content/getHomePageContent.ts`, `src/lib/content/types.ts`*

```ts
// Illustrative only.
export async function getHomePageContent(): Promise<HomePageContent> {
  const response = await fetch(`${contentApiBaseUrl}/api/content/home`);
  if (!response.ok) throw new Error(`Content API returned ${response.status}`);
  const result = await response.json();
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
- [ ] Images have useful backoffice-managed alt text and stable dimensions.
- [ ] External embeds are constructed from validated providers/IDs and lazy-loaded.
- [ ] Empty optional collections hide gracefully without empty headings or broken grids.
- [ ] Keyboard navigation, focus visibility, contrast, and mobile behavior are preserved.
- [ ] The public bundle excludes React-admin, Material UI, and all admin code and meets the agreed initial JavaScript budget.
- [ ] A production build contains the current published content.

#### Code

*Files: `src/pages/index.astro`, `src/layouts/Layout.astro`, `src/app/ArtistApp.tsx`, `src/app/components/Nav.tsx`, `src/app/components/Hero.tsx`, `src/app/components/About.tsx`, `src/app/components/Music.tsx`, `src/app/components/Videos.tsx`, `src/app/components/Contact.tsx`, `src/app/components/Footer.tsx`*

---

#### Task 2.3 — Connect publishing to Workers Builds

**Labels:** `publishing`, `ci-cd`, `cloudflare`
**Assignee:** TBD
**Blocked by:** Tasks 1.3 and 4.2, plus an existing Cloudflare Workers Builds Git connection

**Description**

Implement aggregate publication and build-status handling in the Worker/backoffice, create a production deploy hook, and invoke it only after a successful publication commit. Document retries, rotation, and failure diagnosis.

**Acceptance Criteria**

- [ ] Publishing validates the complete aggregate, promotes selected drafts, appends revisions/audit data, and requests one production build.
- [ ] Draft-only edits and media uploads do not trigger production builds.
- [ ] The deploy-hook URL is stored only as a Wrangler secret and never returned by an API.
- [ ] The backoffice exposes pending/succeeded/failed state and a safe retry that does not create duplicate content revisions.
- [ ] A failed content build leaves the prior production deployment active.
- [ ] The runbook explains how to inspect deploy-hook requests and Workers Build status and how to rotate the hook.

#### Code

*Files: `worker/services/publish-content.ts`, `worker/routes/admin/publish.ts`, `src/admin/PublishAction.tsx`, `documentation/runbooks/content-publishing.md`, `.dev.vars.example` (names only, no values)*

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
- [ ] `ProfilePage`/`Person` structured data contains only accurate visible published data and passes the selected validators.
- [ ] `@astrojs/sitemap` is installed with pnpm and configured using the canonical production `site` value.
- [ ] `astro.config.mjs` has an absolute production `site`; the sitemap contains the canonical public URL and excludes `/admin/*`, `/api/*`, previews, and error pages.
- [ ] `robots.txt` advertises the sitemap; production `/` is indexable and protected/admin/preview/error surfaces are not presented as public search results.
- [ ] React-admin and all admin-only code are absent from public bundles and the budgets in section G.4 pass on a production-like preview.
- [ ] Automated checks inspect `dist/index.html`, sitemap, robots, canonical agreement, JSON-LD parseability, image attributes, and absence of eagerly loaded third-party iframes.

#### Code

*Files: `src/layouts/Layout.astro`, `src/app/components/ResponsiveImage.tsx`, `src/app/components/MediaFacade.tsx`, `src/app/components/Music.tsx`, `src/app/components/Videos.tsx`, `src/lib/seo.ts`, `src/pages/robots.txt.ts`, `src/pages/404.astro`, `astro.config.mjs`, `package.json`, `test/seo/build-output.test.ts`, `test/performance/resource-loading.test.ts`*

---

### Epic 3: Contact Backend and Private Data

**Area:** Worker API and D1
**Assignee:** TBD
**Priority:** High

---

#### Task 3.1 — Add inquiry persistence and abuse-control foundations

**Labels:** `backend`, `cloudflare`, `d1`
**Assignee:** TBD
**Blocked by:** Tasks 1.1 and 1.2

**Description**

Add the inquiry/event tables, repositories, rate-control interfaces, sanitized request telemetry, and the second D1 migration without changing the public form behavior.

**Acceptance Criteria**

- [ ] Migration `0002` creates the inquiry/event tables, constraints, and indexes in section C.
- [ ] Repository operations create inquiry and event records atomically and enforce idempotency.
- [ ] Rate-control abstractions can use coarse request signals without persisting raw IP addresses.
- [ ] Observability is enabled without logging personal message data.
- [ ] `pnpm build` and `pnpm exec wrangler deploy --dry-run` pass.

#### Code

*Files: `worker/repositories/inquiries.ts`, `worker/lib/rate-control.ts`, `worker/migrations/0002_contact_inquiries.sql`, `test/worker/inquiries-repository.test.ts`*

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

*Files: `src/app/components/Contact.tsx`, `src/app/hooks/useContactForm.ts`, `src/lib/content/schema.ts`*

---

#### Task 3.4 — Add inquiry retention and recovery primitives

**Labels:** `backend`, `d1`, `privacy`, `operations`
**Assignee:** TBD
**Blocked by:** Task 3.1

**Description**

Add dry-run purge selection, explicit-target safeguards, and recovery helpers needed by the later operational runbook. Do not automate production deletion yet.

**Acceptance Criteria**

- [ ] Dry-run reports candidate IDs, dates, and counts without names, addresses, or message bodies.
- [ ] Selection is deterministic and matches the configurable policy without deleting rows.
- [ ] Any destructive execution requires an explicit immutable target and confirmation flag.
- [ ] Tests prove recent, non-deleted, and policy-exempt records are preserved.
- [ ] Recovery helpers identify the required Time Travel/export steps without invoking production restore.

#### Code

*Files: `scripts/purge-inquiries.ts`, `worker/repositories/inquiries.ts`, `test/worker/retention.test.ts`, `package.json`*

---

### Epic 4: Protected Backoffice

**Area:** Admin UI and identity
**Assignee:** TBD
**Priority:** Medium

---

#### Task 4.1 — Protect the admin surface with Cloudflare Access

**Labels:** `security`, `cloudflare-access`, `backoffice`
**Assignee:** TBD
**Blocked by:** Task 1.1, approved editor identities, intended admin domain, and Cloudflare Zero Trust configuration authorization

**Description**

Create Access application paths covering `/admin`, `/admin/*`, and `/api/admin/*`, restrict them to approved identities, and implement server-side JWT validation for the admin API.

**Acceptance Criteria**

- [ ] Anonymous users cannot load admin pages or call admin APIs.
- [ ] Only approved identities satisfy the Access policy.
- [ ] Worker verification checks JWT signature, issuer, audience, and expiry.
- [ ] Missing, invalid, or wrong-audience tokens return `401` or `403` without D1 access.
- [ ] Access configuration and recovery ownership are documented without exporting secrets.

#### Code

*Files: `worker/middleware/requireAccess.ts`, `worker/routes/admin.ts`, `documentation/runbooks/admin-access.md`*

---

#### Task 4.2 — Build the React-admin content, media, and inquiry backoffice

**Labels:** `backoffice`, `frontend`, `d1`
**Assignee:** TBD
**Blocked by:** Tasks 1.3, 3.1, and 4.1

**Description**

Install the open-source React-admin core through pnpm, create a custom same-origin data provider and Access-aware auth provider, and build the protected content, media, revision, publication, and inquiry experiences. Keep the interface deliberately small and accessible.

**Acceptance Criteria**

- [ ] React-admin and Material UI are isolated to admin chunks and absent from the public SPA bundle.
- [ ] The custom data provider implements typed pagination, filtering, CRUD, optimistic concurrency, restore, upload, and publish calls over `/api/admin/*`.
- [ ] The auth provider uses the server-validated session endpoint; it does not treat client-side state as authorization.
- [ ] The dashboard links clearly to Content, Media, Publication, and Inquiries and reports draft/publication state.
- [ ] Settings and home page are singleton forms; tracks and videos support ordering, create, edit, archive, and empty states.
- [ ] Rich text uses the open-source TipTap input with an allow-listed toolbar and server-side sanitization.
- [ ] Media upload requires alt text, reports validation failures, and prevents destructive deletion while referenced.
- [ ] Revision history supports comparison metadata and restore-to-new-draft, never in-place history mutation.
- [ ] The inbox supports cursor pagination and status filtering.
- [ ] Full message content loads only in the detail view and is rendered as text.
- [ ] Valid status changes create an audit event containing the authenticated actor.
- [ ] Delete requires confirmation and performs soft deletion.
- [ ] Private API responses use `Cache-Control: no-store`.
- [ ] Empty, loading, stale, unauthorized, and server-error states are handled.
- [ ] Automated tests cover authentication, pagination, detail, transitions, and deletion.

#### Code

*Files: `src/pages/admin/index.astro`, `src/admin/AdminApp.tsx`, `src/admin/dataProvider.ts`, `src/admin/authProvider.ts`, `src/admin/resources/content/`, `src/admin/resources/media/`, `src/admin/resources/inquiries/`, `worker/routes/admin/session.ts`, `worker/routes/admin/inquiries.ts`, `test/worker/admin-inquiries.test.ts`*

---

#### Task 4.3 — Implement retention purge and recovery runbooks

**Labels:** `backend`, `privacy`, `operations`
**Assignee:** TBD
**Blocked by:** Tasks 3.4 and 4.2, plus owner confirmation of retention policy

**Description**

Implement and document inquiry purge, D1 Time Travel recovery, content-revision restoration, R2 recovery/inventory, and export handling. Prefer a manually invoked, reviewed command initially; automate only after the behavior is proven.

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
**Blocked by:** Tasks 1.4, 2.3, 2.4, 3.3, 4.2, and 4.3

**Description**

Extend the Vitest Workers-runtime foundation from Task 1.1 and verify the primary visitor/editor workflows, build output, browser behavior, and production-like release gates.

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

Execute the production migration behind explicit authorization: provision D1/R2 bindings and secrets, import and publish reviewed content, verify Access, deploy, submit a synthetic inquiry, and confirm publishing automation.

**Acceptance Criteria**

- [ ] Production D1 migration succeeds before code that depends on it is enabled.
- [ ] Required Wrangler secrets and build variables exist and are not printed.
- [ ] Reviewed content is published and matches the pre-migration site unless an editorial change was separately approved.
- [ ] Public pages, media, anchors, metadata, embeds, and contact submission work in production.
- [ ] Anonymous admin/API access is denied and an approved editor can use content, media, publishing, and inquiry workflows.
- [ ] A backoffice publish causes one successful Workers Build and updated static content.
- [ ] The synthetic inquiry is removed after verification.
- [ ] Rollback owners and commands are known before enablement.

---

## Execution Order

```text
1.1 --> 1.2 --> 1.3 --> 2.1 --> 2.2 --> 2.4
          |       |
          +--> 1.4
          |
          +--> 3.1 --> 3.2 ----------------> 3.3
                    +--> 3.4

1.1 --> 4.1
{1.3, 3.1, 4.1} --> 4.2 --> 2.3
{3.4, 4.2} -------------> 4.3

{1.4, 2.3, 2.4, 3.3, 4.2, 4.3} --> 5.1
{2.3, 3.3, 4.3, 5.1} -----------> 5.2
```

- Task 1.1 is the first implementation item and can be completed locally without provisioning remote resources.
- After Task 1.2, Tasks 1.4 and 3.1 can proceed in parallel while Task 1.3 implements the content/media APIs and import.
- Task 4.1 can proceed after Task 1.1 once editor identities and the intended admin domain are known; remote Access configuration still requires authorization.
- After Task 1.3, the build loader (2.1) and backoffice work (4.2, once Access is ready) can proceed independently.
- The public SPA conversion (2.2) and contact API (3.2) can proceed in parallel; the real contact UI (3.3) joins them.
- Publishing automation (2.3) waits for the content API and backoffice, while draft saving remains usable without it.
- Production provisioning, Access policies, remote routes, and deployment require explicit authorization; planning them does not authorize those changes.

## Deployment Sequence

1. Build and test the Worker, schemas, local D1/R2 storage, content APIs, migration tooling, and import entirely against local resources.
2. Provision isolated non-production D1, R2, Access, Turnstile, and Workers Builds resources; apply migrations and import current content as drafts.
3. Deploy the Worker/API with the existing static site first, verify static bypass, Access denial, public-content output, media delivery, and recovery controls.
4. Publish the reviewed imported content and prove one deploy-hook build against the non-production environment.
5. Merge the React SPA conversion, content integration, lazy-loading policy, and SEO output only after required content is published and section G's preview gates pass.
6. Provision production D1 and R2, apply migrations, import drafts, configure secrets/variables, and configure Access before exposing `/admin/*` or `/api/admin/*`.
7. Deploy the combined static assets and Worker backend; verify public static routes still bypass Worker execution and admin routes remain protected.
8. Publish the reviewed production content, verify one successful Workers Build, then enable the real contact endpoint and run one synthetic end-to-end submission.
9. Monitor Worker errors, D1 writes, R2 operations, Turnstile rejection, Access denials, build failures, field Core Web Vitals, crawl/index coverage, sitemap status, and structured-data issues.

Rollback is split by layer:

- **Frontend/Worker code:** roll back to the prior Cloudflare Worker deployment. Do not down-migrate D1 merely to roll back code.
- **Content:** restore the prior immutable D1 revision into a new draft, publish it, then trigger a new build.
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
- [ ] Versioned D1 and content-payload migration workflows have been exercised against non-production copies, including dry run, compatibility validation, and recovery.
- [ ] Retention, deletion, content rollback, code rollback, and D1 recovery procedures are documented and tested outside production.
- [ ] Responsive design, semantic HTML, keyboard use, visible focus, alt text, and contrast are preserved.
- [ ] `pnpm build`, the added automated tests, and `pnpm exec wrangler deploy --dry-run` pass from a clean checkout.
- [ ] `git status` contains no generated `dist/`/`.astro/`, credentials, or unrelated changes.

## Explicit Non-Goals

- Migrating Astro to SSR or adding `@astrojs/cloudflare` for the initial release.
- Adding a client routing library or multiple public route views before the SPA has distinct URL-addressable view requirements and a deep-link fallback design.
- Building a general drag-and-drop page builder.
- Writing password, session, recovery, or MFA flows instead of using Cloudflare Access.
- Building React CRUD/form primitives already supplied by the open-source React-admin core.
- Storing private inquiries in the public content API or published static output.
- Building a CRM, newsletter platform, user account system, booking engine, or payment system.
- Sending automated email replies or marketing messages.
- Hosting original video/audio masters; the initial model links to established media platforms.
- Changing existing names, contact details, biography, or external links during technical migration.
- Changing remote routes, domains, bindings, or Cloudflare resources without explicit authorization.
- Adding a second CMS runtime, container, or externally hosted database for the initial scope.

## Open Decisions Before Implementation

1. Identify the editor email identities and identity provider used by Cloudflare Access.
2. Confirm the intended admin hostname/path and whether previews use a separate Access application.
3. Confirm whether the public contact email remains visible on the site.
4. Confirm the inquiry retention period and obtain any required privacy/legal review.
5. Confirm whether Publish should immediately request a production build or require a separate Deploy action; the recommended initial behavior is one explicit Publish-and-Deploy action.
6. Confirm whether inquiry email notifications are required; they are not included in the base scope.
7. Confirm the canonical production domain and the public social/profile URLs permitted in `sameAs` structured data.
8. Confirm the maximum editorial image size and accepted formats before enabling uploads.

## Primary References

- [React-admin documentation](https://marmelab.com/react-admin/Readme.html)
- [React-admin data providers](https://marmelab.com/react-admin/DataProviders)
- [React-admin security](https://marmelab.com/react-admin/SecurityGuide.html)
- [Astro's official React integration](https://docs.astro.build/en/guides/integrations-guide/react/)
- [Astro framework components and hydration](https://docs.astro.build/en/guides/framework-components/)
- [Astro sitemap integration](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
- [Google JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google ProfilePage structured data](https://developers.google.com/search/docs/appearance/structured-data/profile-page)
- [Core Web Vitals](https://web.dev/articles/vitals)
- [MDN lazy-loading guidance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Lazy_loading)
- [Cloudflare Workers Static Assets bindings and selective `run_worker_first`](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare Workers Builds deploy hooks](https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/)
- [Cloudflare D1 overview](https://developers.cloudflare.com/d1/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Cloudflare Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
