import { z } from 'zod';

export const CONTENT_SCHEMA_VERSION = 1 as const;

const requiredText = (maxLength: number) => z.string().trim().min(1).max(maxLength);
const optionalText = (maxLength: number) => z.string().trim().max(maxLength).optional();

const httpsUrlSchema = z.url().refine((value) => {
  return new URL(value).protocol === 'https:';
}, 'URL must use HTTPS');

const uniqueBy = <T>(items: T[], key: (item: T) => string) => {
  return new Set(items.map(key)).size === items.length;
};

const ObjectKeySchema = requiredText(512).refine((value) => {
  return !value.startsWith('/') && !value.includes('..');
}, 'Object key must be a relative safe path');

const ImageMimeTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

export const EditorEmailSchema = z.email().max(254);

export const ManagedImageSchema = z.strictObject({
  assetId: z.uuid(),
  objectKey: ObjectKeySchema,
  alt: requiredText(300),
  width: z.int().positive().max(20_000),
  height: z.int().positive().max(20_000),
  mimeType: ImageMimeTypeSchema,
  focalPoint: z.strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }).optional(),
});

export const LinkSchema = z.strictObject({
  label: requiredText(100),
  href: requiredText(2_048).refine((value) => {
    if (value.startsWith('#')) {
      return /^#[a-z][a-z0-9-]*$/.test(value);
    }

    if (value.startsWith('/') && !value.startsWith('//')) {
      return true;
    }

    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Link must be an anchor, site path, or HTTPS URL'),
});

const SeoSettingsSchema = z.strictObject({
  title: requiredText(70),
  description: requiredText(200),
  shareImage: ManagedImageSchema,
  canonicalPath: z.literal('/'),
  person: z.strictObject({
    name: requiredText(120),
    description: requiredText(500),
    image: ManagedImageSchema.optional(),
    sameAs: z.array(httpsUrlSchema).max(12).refine((items) => {
      return uniqueBy(items, (item) => item);
    }, 'Profile URLs must be unique'),
  }),
});

const NavigationItemSchema = z.strictObject({
  label: requiredText(50),
  anchor: z.enum(['#about', '#music', '#videos', '#contact']),
});

const SocialLinkSchema = z.strictObject({
  platform: z.enum(['instagram', 'youtube', 'spotify', 'soundcloud', 'other']),
  label: requiredText(100),
  url: httpsUrlSchema,
});

const ContactSubjectSchema = z.strictObject({
  label: requiredText(100),
  value: requiredText(50).regex(/^[a-z0-9-]+$/),
});

export const SiteSettingsSchema = z.strictObject({
  siteTitle: requiredText(120),
  seo: SeoSettingsSchema,
  artistName: requiredText(120),
  shortDescriptor: requiredText(200),
  contactEmail: z.email().max(254),
  location: requiredText(120),
  navigation: z.array(NavigationItemSchema).min(1).max(4).refine((items) => {
    return uniqueBy(items, (item) => item.anchor);
  }, 'Navigation anchors must be unique'),
  socialLinks: z.array(SocialLinkSchema).max(12).refine((items) => {
    return uniqueBy(items, (item) => item.url);
  }, 'Social URLs must be unique'),
  contactSubjects: z.array(ContactSubjectSchema).min(1).max(20).refine((items) => {
    return uniqueBy(items, (item) => item.value);
  }, 'Contact subject values must be unique'),
  footerText: requiredText(300),
});

const SectionHeadingSchema = z.strictObject({
  eyebrow: requiredText(100),
  heading: requiredText(160),
});

export const HomePageSchema = z.strictObject({
  hero: z.strictObject({
    eyebrow: requiredText(160),
    headingLineOne: requiredText(120),
    headingLineTwo: requiredText(120),
    introduction: requiredText(500),
    primaryCta: LinkSchema,
    secondaryCta: LinkSchema,
  }),
  about: z.strictObject({
    eyebrow: requiredText(100),
    heading: requiredText(160),
    portrait: ManagedImageSchema.optional(),
    bodyHtml: requiredText(20_000),
    stats: z.array(z.strictObject({
      value: requiredText(30),
      label: requiredText(80),
    })).max(6),
  }),
  music: SectionHeadingSchema.extend({
    embedUrl: httpsUrlSchema.optional(),
  }),
  videos: SectionHeadingSchema,
  contact: SectionHeadingSchema.extend({
    introduction: requiredText(500),
  }),
});

export const TrackSchema = z.strictObject({
  title: requiredText(160),
  releaseType: z.enum(['single', 'collaboration', 'session', 'album', 'other']),
  releaseYear: z.int().min(1900).max(2100).optional(),
  artwork: ManagedImageSchema.optional(),
  listenUrl: httpsUrlSchema,
  featured: z.boolean(),
  sortOrder: z.int().nonnegative().max(100_000),
});

export const VideoSchema = z.strictObject({
  title: requiredText(160),
  provider: z.enum(['youtube', 'vimeo']),
  videoId: requiredText(64),
  caption: optionalText(500),
  thumbnail: ManagedImageSchema.optional(),
  featured: z.boolean(),
  sortOrder: z.int().nonnegative().max(100_000),
}).superRefine((value, context) => {
  const valid = value.provider === 'youtube'
    ? /^[A-Za-z0-9_-]{11}$/.test(value.videoId)
    : /^\d{6,12}$/.test(value.videoId);

  if (!valid) {
    context.addIssue({
      code: 'custom',
      path: ['videoId'],
      message: `Invalid ${value.provider} video ID`,
    });
  }
});

export const ContentTypeSchema = z.enum([
  'siteSettings',
  'homePage',
  'track',
  'video',
]);

export type ContentType = z.infer<typeof ContentTypeSchema>;
export type ManagedImage = z.infer<typeof ManagedImageSchema>;
export type SiteSettings = z.infer<typeof SiteSettingsSchema>;
export type HomePage = z.infer<typeof HomePageSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Video = z.infer<typeof VideoSchema>;

export type ContentPayloadByType = {
  siteSettings: SiteSettings;
  homePage: HomePage;
  track: Track;
  video: Video;
};

export const ContentPayloadSchemas = {
  siteSettings: SiteSettingsSchema,
  homePage: HomePageSchema,
  track: TrackSchema,
  video: VideoSchema,
} satisfies Record<ContentType, z.ZodType>;

export function parseContentPayload<T extends ContentType>(
  contentType: T,
  value: unknown,
): ContentPayloadByType[T] {
  return ContentPayloadSchemas[contentType].parse(value) as ContentPayloadByType[T];
}

export function serializeContentPayload<T extends ContentType>(
  contentType: T,
  data: ContentPayloadByType[T],
): string {
  return JSON.stringify({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentType,
    data: parseContentPayload(contentType, data),
  });
}

export function parseStoredContentPayload<T extends ContentType>(
  contentType: T,
  value: string,
): ContentPayloadByType[T] {
  const envelope = z.strictObject({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    contentType: ContentTypeSchema,
    data: z.unknown(),
  }).parse(JSON.parse(value));

  if (envelope.contentType !== contentType) {
    throw new TypeError(
      `Stored ${envelope.contentType} payload cannot be read as ${contentType}`,
    );
  }

  return parseContentPayload(contentType, envelope.data);
}

export const MediaAssetInputSchema = z.strictObject({
  objectKey: ObjectKeySchema,
  originalFilename: requiredText(255),
  mimeType: ImageMimeTypeSchema,
  byteSize: z.int().positive().max(20 * 1024 * 1024),
  width: z.int().positive().max(20_000),
  height: z.int().positive().max(20_000),
  checksum: requiredText(128).regex(/^[a-f0-9]+$/i),
  altText: requiredText(300),
});

export type MediaAssetInput = z.infer<typeof MediaAssetInputSchema>;

export const HomePageContentSchema = z.strictObject({
  settings: SiteSettingsSchema,
  page: HomePageSchema,
  tracks: z.array(TrackSchema),
  videos: z.array(VideoSchema),
});

export type HomePageContent = z.infer<typeof HomePageContentSchema>;
