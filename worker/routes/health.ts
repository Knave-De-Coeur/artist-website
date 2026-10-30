import { contentJson, OpenAPIRoute } from 'chanfana';
import { z } from 'zod';

const HealthResponseSchema = z.object({
  ok: z.literal(true),
});

export class HealthEndpoint extends OpenAPIRoute {
  schema = {
    summary: 'Check whether the Worker API is available',
    responses: {
      '200': {
        description: 'The API is available',
        ...contentJson(HealthResponseSchema),
      },
    },
  };

  handle() {
    return HealthResponseSchema.parse({ ok: true });
  }
}
