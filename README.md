# Artist Website

Portfolio website for Via Axum — bass player, session musician, and artist. Built with Astro and Tailwind CSS, deployed on Cloudflare Workers.

## Tech Stack

- [Astro](https://astro.build/) — Static site framework
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first styling
- [Cloudflare Workers](https://workers.cloudflare.com/) — Static asset hosting and deployment

## Getting Started

```bash
pnpm install
pnpm dev
```

Dev server runs at `http://localhost:4321`.

## Build & Deploy

```bash
pnpm build
pnpm preview
```

`pnpm preview` builds the site and serves it locally with the Workers runtime.

Deploy to Cloudflare Workers with:

```bash
pnpm deploy
```

The deploy command builds the site before publishing it.

## Project Structure

```
src/
├── components/
│   ├── Nav.astro        # Sticky navigation with mobile menu
│   ├── Hero.astro       # Landing section with CTAs
│   ├── About.astro      # Bio, photo, and stats
│   ├── Music.astro      # Track cards and embed placeholders
│   ├── Videos.astro     # Video embed grid
│   ├── Contact.astro    # Contact form and info
│   └── Footer.astro     # Social links and copyright
├── layouts/
│   └── Layout.astro     # Base HTML layout
└── pages/
    └── index.astro      # Main page
```

## Customisation

- **Photo** — Drop an image in `public/` and update `About.astro`
- **Social links** — Update URLs in `Footer.astro`
- **Music embeds** — Replace placeholders in `Music.astro` with Spotify/SoundCloud iframes
- **Video embeds** — Replace placeholders in `Videos.astro` with YouTube iframes
- **Contact form** — Wire up to [Formspree](https://formspree.io) or a Cloudflare Worker (see `Contact.astro`)
