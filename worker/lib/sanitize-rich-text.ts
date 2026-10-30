const ALLOWED_TAGS = new Set([
  'a',
  'blockquote',
  'br',
  'em',
  'li',
  'ol',
  'p',
  'strong',
  'ul',
]);

const REMOVE_WITH_CONTENT = new Set([
  'embed',
  'form',
  'iframe',
  'input',
  'math',
  'object',
  'script',
  'style',
  'svg',
  'template',
]);

function safeHref(value: string): string | null {
  if (/^#[a-z][a-z0-9-]*$/i.test(value)) {
    return value;
  }

  if (value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'mailto:' ? url.href : null;
  } catch {
    return null;
  }
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return typeof value === 'object'
    && value !== null
    && Symbol.iterator in value;
}

class RichTextElementHandler implements HTMLRewriterElementContentHandlers {
  element(element: Element): void {
    const tagName = element.tagName.toLowerCase();

    if (REMOVE_WITH_CONTENT.has(tagName)) {
      element.remove();
      return;
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      element.removeAndKeepContent();
      return;
    }

    // Astro's DOM types and Workers runtime types both declare Element globally,
    // so read the runtime iterator defensively instead of asserting either type.
    const attributes: unknown = Reflect.get(element, 'attributes');
    if (!isIterable(attributes)) {
      element.remove();
      return;
    }

    const attributeNames: string[] = [];
    for (const attribute of attributes) {
      if (!Array.isArray(attribute) || typeof attribute[0] !== 'string') {
        continue;
      }
      attributeNames.push(attribute[0]);
    }

    for (const name of attributeNames) {
      const keep = tagName === 'a' && (name === 'href' || name === 'title');
      if (!keep) {
        element.removeAttribute(name);
      }
    }

    if (tagName !== 'a') {
      return;
    }

    const href = element.getAttribute('href');
    const sanitizedHref = href ? safeHref(href) : null;
    if (!sanitizedHref) {
      element.removeAttribute('href');
      return;
    }

    element.setAttribute('href', sanitizedHref);
    if (sanitizedHref.startsWith('https:')) {
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }

  comments(comment: Comment): void {
    comment.remove();
  }
}

export async function sanitizeRichText(html: string): Promise<string> {
  const response = new HTMLRewriter()
    .on('*', new RichTextElementHandler())
    .transform(new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    }));

  return response.text();
}
