import { type HttpHandler } from 'msw';
import { createOpenApiHttp } from 'openapi-msw';

// The seed file is the single source of the 55 indicators (embedded by the
// backend); the mock is derived from it at build time, never typed by hand.
import seed from '../../../backend/seed/cre-indicators.json';

import type { components, paths } from '@/lib/api/generated/schema';

const http = createOpenApiHttp<paths>({ baseUrl: '*/api/v1' });

type Catalogue = components['schemas']['Catalogue'];
type IslandList = components['schemas']['IslandList'];
type ProjectTypeList = components['schemas']['ProjectTypeList'];

/**
 * Catalogue as the api serves it: Thai text (every other locale falls back to
 * `th` per text, so the mock serves `th` for any locale), dimensions in seed
 * order, factors ordered by `no`, indicators in seed order.
 */
export const mockCatalogue: Catalogue = {
  locale: 'th',
  dimensions: seed.dimensions.map((d) => ({
    code: d.code,
    name: d.name_th,
    factors: seed.factors
      .filter((f) => f.dimension_code === d.code)
      .sort((a, b) => a.no - b.no)
      .map((f) => ({
        code: f.code,
        name: f.name_th,
        indicators: seed.indicators
          .filter((i) => i.factor_code === f.code)
          .map((i) => ({
            code: i.group_id,
            name: i.name_th,
            unit: i.unit_th,
            question_x: i.question_x ?? null,
            question_y1: i.question_y1 ?? null,
            question_y2: i.question_y2 ?? null,
            question_y3: i.question_y3 ?? null,
          })),
      })),
  })),
  // Option A ("very low impact") excludes every other option.
  ri_e_options: seed.ri_e_options.map((o) => ({
    code: o.code,
    label: o.label_th,
    is_exclusive: o.code === 'A',
  })),
};

// Codes of the lookup rows, as in the contract enums; `other` last.
export const mockIslands: IslandList = {
  items: [
    'koh_tao',
    'koh_samui',
    'koh_phangan',
    'koh_phi_phi',
    'koh_lanta',
    'koh_chang',
    'koh_kood',
    'other',
  ].map((code) => ({ code })),
};

export const mockProjectTypes: ProjectTypeList = {
  items: ['building', 'pier', 'road', 'utilities', 'coastal', 'other'].map((code) => ({ code })),
};

const cacheHeaders = (tag: string) => ({ ETag: tag, 'Cache-Control': 'private, no-cache' });

export const catalogueHandlers: HttpHandler[] = [
  http.get('/catalogue', ({ request, response }) => {
    const tag = '"mock-catalogue-1"';
    return request.headers.get('If-None-Match') === tag
      ? response(304).empty({ headers: { ETag: tag } })
      : response(200).json(mockCatalogue, { headers: cacheHeaders(tag) });
  }),
  http.get('/islands', ({ request, response }) => {
    const tag = '"mock-islands-1"';
    return request.headers.get('If-None-Match') === tag
      ? response(304).empty({ headers: { ETag: tag } })
      : response(200).json(mockIslands, { headers: cacheHeaders(tag) });
  }),
  http.get('/project-types', ({ request, response }) => {
    const tag = '"mock-project-types-1"';
    return request.headers.get('If-None-Match') === tag
      ? response(304).empty({ headers: { ETag: tag } })
      : response(200).json(mockProjectTypes, { headers: cacheHeaders(tag) });
  }),
];
