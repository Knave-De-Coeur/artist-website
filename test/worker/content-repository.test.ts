import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  SiteSettingsSchema,
  VideoSchema,
} from '../../src/lib/content/schema';
import {
  ContentRepository,
  StaleContentVersionError,
} from '../../worker/repositories/content';
import { MediaRepository } from '../../worker/repositories/media';
import {
  actorEmail,
  homePage,
  siteSettings,
  track,
} from './fixtures/content';

describe('shared content schemas', () => {
  it('rejects unsafe URLs, duplicate profiles, and invalid provider IDs', () => {
    expect(() => SiteSettingsSchema.parse(siteSettings({
      socialLinks: [{
        platform: 'other',
        label: 'Unsafe',
        url: 'http://example.com',
      }],
    }))).toThrow();

    const settings = siteSettings();
    expect(() => SiteSettingsSchema.parse({
      ...settings,
      seo: {
        ...settings.seo,
        person: {
          ...settings.seo.person,
          sameAs: ['https://example.com/alex', 'https://example.com/alex'],
        },
      },
    })).toThrow();

    expect(() => VideoSchema.parse({
      title: 'Invalid video',
      provider: 'youtube',
      videoId: 'not-a-youtube-id',
      featured: true,
      sortOrder: 0,
    })).toThrow();
  });
});

describe('ContentRepository', () => {
  const repository = new ContentRepository(env.DB);

  it('enforces the stable singleton identity', async () => {
    const created = await repository.create({
      contentType: 'siteSettings',
      data: siteSettings(),
      actorEmail,
    });

    expect(created.id).toBe('siteSettings');
    expect(created.version).toBe(1);
    expect(created.published).toBeNull();

    await expect(repository.create({
      contentType: 'siteSettings',
      data: siteSettings({ siteTitle: 'Duplicate' }),
      actorEmail,
      id: crypto.randomUUID(),
    })).rejects.toThrow();

    await expect(repository.listRevisions('siteSettings', 'siteSettings'))
      .resolves.toHaveLength(1);
  });

  it('generates opaque repeatable IDs and immutable save revisions', async () => {
    const created = await repository.create({
      contentType: 'track',
      data: track(),
      actorEmail,
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    const saved = await repository.saveDraft({
      id: created.id,
      contentType: 'track',
      expectedVersion: created.version,
      data: track({ title: 'Updated Track', sortOrder: 4 }),
      actorEmail,
    });

    expect(saved.version).toBe(2);
    expect(saved.draft.title).toBe('Updated Track');
    expect(saved.sortOrder).toBe(4);
    expect(saved.published).toBeNull();

    const revisions = await repository.listRevisions(created.id, 'track');
    expect(revisions.map(({ version, eventType }) => ({ version, eventType }))).toEqual([
      { version: 2, eventType: 'saved' },
      { version: 1, eventType: 'created' },
    ]);
  });

  it('enforces unique featured ordering within a content type', async () => {
    await repository.create({
      contentType: 'track',
      data: track({ title: 'First Ordered Track', sortOrder: 90_000 }),
      actorEmail,
    });

    await expect(repository.create({
      contentType: 'track',
      data: track({ title: 'Conflicting Track', sortOrder: 90_000 }),
      actorEmail,
    })).rejects.toThrow();
  });

  it('rejects stale writes without changing the document or revisions', async () => {
    const created = await repository.create({
      contentType: 'track',
      data: track({ title: 'Concurrency Track' }),
      actorEmail,
    });
    await repository.saveDraft({
      id: created.id,
      contentType: 'track',
      expectedVersion: 1,
      data: track({ title: 'Current Draft' }),
      actorEmail,
    });

    await expect(repository.saveDraft({
      id: created.id,
      contentType: 'track',
      expectedVersion: 1,
      data: track({ title: 'Stale Draft' }),
      actorEmail,
    })).rejects.toBeInstanceOf(StaleContentVersionError);

    const current = await repository.get(created.id, 'track');
    expect(current?.version).toBe(2);
    expect(current?.draft.title).toBe('Current Draft');
    await expect(repository.listRevisions(created.id, 'track')).resolves.toHaveLength(2);
  });

  it('rolls back a draft update when its revision batch fails', async () => {
    await repository.create({
      contentType: 'track',
      data: track({ title: 'Ordering Owner', sortOrder: 80_000 }),
      actorEmail,
    });
    const candidate = await repository.create({
      contentType: 'track',
      data: track({ title: 'Ordering Candidate', sortOrder: 80_001 }),
      actorEmail,
    });

    await expect(repository.saveDraft({
      id: candidate.id,
      contentType: 'track',
      expectedVersion: 1,
      data: track({ title: 'Conflicting Update', sortOrder: 80_000 }),
      actorEmail,
    })).rejects.toThrow();

    const unchanged = await repository.get(candidate.id, 'track');
    expect(unchanged?.version).toBe(1);
    expect(unchanged?.draft.title).toBe('Ordering Candidate');
    expect(unchanged?.sortOrder).toBe(80_001);
    await expect(repository.listRevisions(candidate.id, 'track')).resolves.toHaveLength(1);
  });

  it('publishes the validated draft and publication revision atomically', async () => {
    const created = await repository.create({
      contentType: 'track',
      data: track({ title: 'Ready to Publish' }),
      actorEmail,
    });
    const published = await repository.publish({
      id: created.id,
      contentType: 'track',
      expectedVersion: 1,
      actorEmail,
    });

    expect(published.publicationState).toBe('published');
    expect(published.version).toBe(2);
    expect(published.publishedVersion).toBe(2);
    expect(published.published).toEqual(published.draft);

    const revisions = await repository.listRevisions(created.id, 'track');
    expect(revisions[0]?.eventType).toBe('published');
    expect(revisions[0]?.snapshot).toEqual(published.draft);
  });

  it('restores an immutable revision into a new draft version', async () => {
    const created = await repository.create({
      contentType: 'track',
      data: track({ title: 'Original' }),
      actorEmail,
    });
    const saved = await repository.saveDraft({
      id: created.id,
      contentType: 'track',
      expectedVersion: 1,
      data: track({ title: 'Changed' }),
      actorEmail,
    });
    const restored = await repository.restore({
      id: created.id,
      contentType: 'track',
      revisionVersion: 1,
      expectedVersion: saved.version,
      actorEmail,
    });

    expect(restored.version).toBe(3);
    expect(restored.draft.title).toBe('Original');
    const revisions = await repository.listRevisions(created.id, 'track');
    expect(revisions[0]?.eventType).toBe('restored');
  });

  it('sanitizes rich text before it reaches D1', async () => {
    const created = await repository.create({
      contentType: 'homePage',
      data: homePage({
        about: {
          ...homePage().about,
          bodyHtml: [
            '<p onclick="steal()">Hello<script>alert(1)</script>',
            '<a href="javascript:steal()">bad</a>',
            '<a href="https://example.com">safe</a></p>',
          ].join(''),
        },
      }),
      actorEmail,
    });

    expect(created.draft.about.bodyHtml).toContain('<p>Hello');
    expect(created.draft.about.bodyHtml).toContain(
      '<a href="https://example.com/" rel="noopener noreferrer">safe</a>',
    );
    expect(created.draft.about.bodyHtml).not.toContain('onclick');
    expect(created.draft.about.bodyHtml).not.toContain('javascript:');
    expect(created.draft.about.bodyHtml).not.toContain('alert(1)');
  });
});

describe('MediaRepository', () => {
  const repository = new MediaRepository(env.DB);

  it('validates, stores, lists, and soft-deletes media metadata', async () => {
    const created = await repository.create({
      objectKey: `media/${crypto.randomUUID()}.webp`,
      originalFilename: 'portrait.webp',
      mimeType: 'image/webp',
      byteSize: 42_000,
      width: 1_200,
      height: 1_600,
      checksum: 'abcdef0123456789',
      altText: 'Alex holding a bass guitar',
      actorEmail,
    });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(repository.listActive()).resolves.toContainEqual(created);
    await expect(repository.softDelete(created.id)).resolves.toBe(true);
    await expect(repository.listActive()).resolves.not.toContainEqual(created);
  });
});
