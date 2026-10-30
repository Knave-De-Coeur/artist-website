import type {
  HomePage,
  ManagedImage,
  SiteSettings,
  Track,
  Video,
} from '../../../src/lib/content/schema';

export const actorEmail = 'editor@example.com';
let nextTrackSortOrder = 1_000;

export function managedImage(overrides: Partial<ManagedImage> = {}): ManagedImage {
  return {
    assetId: crypto.randomUUID(),
    objectKey: `media/${crypto.randomUUID()}.webp`,
    alt: 'Artist performing on stage',
    width: 1_600,
    height: 900,
    mimeType: 'image/webp',
    ...overrides,
  };
}

export function siteSettings(
  overrides: Partial<SiteSettings> = {},
): SiteSettings {
  return {
    siteTitle: 'Alex Mifsud',
    seo: {
      title: 'Alex Mifsud — Bass Player',
      description: 'Bass player, session musician, and artist based in Malta.',
      shareImage: managedImage(),
      canonicalPath: '/',
      person: {
        name: 'Alex Mifsud',
        description: 'Bass player, session musician, and artist.',
        sameAs: ['https://example.com/alex'],
      },
    },
    artistName: 'Alex Mifsud',
    shortDescriptor: 'Bass Player · Session Musician · Artist',
    contactEmail: 'alex@example.com',
    location: 'Malta',
    navigation: [
      { label: 'About', anchor: '#about' },
      { label: 'Music', anchor: '#music' },
      { label: 'Videos', anchor: '#videos' },
      { label: 'Contact', anchor: '#contact' },
    ],
    socialLinks: [
      {
        platform: 'youtube',
        label: 'Alex on YouTube',
        url: 'https://youtube.com/@example',
      },
    ],
    contactSubjects: [
      { label: 'Session work', value: 'session' },
    ],
    footerText: '© Alex Mifsud',
    ...overrides,
  };
}

export function homePage(overrides: Partial<HomePage> = {}): HomePage {
  return {
    hero: {
      eyebrow: 'Bass Player · Session Musician · Artist',
      headingLineOne: 'Alex',
      headingLineTwo: 'Mifsud',
      introduction: 'Laying down the groove, one line at a time.',
      primaryCta: { label: 'Listen now', href: '#music' },
      secondaryCta: { label: 'Get in touch', href: '#contact' },
    },
    about: {
      eyebrow: 'About me',
      heading: 'The Low End.',
      bodyHtml: '<p>Driven by <strong>groove</strong>, tone, and feel.</p>',
      stats: [
        { value: '10+', label: 'Years playing' },
      ],
    },
    music: {
      eyebrow: 'Music',
      heading: 'Selected releases',
    },
    videos: {
      eyebrow: 'Videos',
      heading: 'Watch and listen',
    },
    contact: {
      eyebrow: 'Contact',
      heading: 'Let’s work together',
      introduction: 'Tell me about your project.',
    },
    ...overrides,
  };
}

export function track(overrides: Partial<Track> = {}): Track {
  return {
    title: 'Test Track',
    releaseType: 'single',
    releaseYear: 2026,
    listenUrl: 'https://example.com/listen',
    featured: true,
    sortOrder: nextTrackSortOrder++,
    ...overrides,
  };
}

export function video(overrides: Partial<Video> = {}): Video {
  return {
    title: 'Test Video',
    provider: 'youtube',
    videoId: 'dQw4w9WgXcQ',
    featured: true,
    sortOrder: 0,
    ...overrides,
  };
}
