import {
  TECDOC_SUCCESS_STATUS,
  TecDocFailure,
  classifyTecDocStatus,
} from './tecdoc-status';

describe('classifyTecDocStatus', () => {
  it('is documented to treat 200 as success', () => {
    expect(TECDOC_SUCCESS_STATUS).toBe(200);
  });

  // 401 "Access not allowed" is the one failure TecAlliance documents: an
  // unrecognised ProviderId, a wrong API key, or a non-whitelisted IP.
  it.each([401, 403])('classifies %i as denied', (status) => {
    expect(classifyTecDocStatus(status)).toBe(TecDocFailure.Denied);
  });

  // 400 is confirmed against the live endpoint rather than inferred from the
  // HTTP meaning: it names the offending field in `statusText` (`Field 'page'
  // must be > 0`) and also covers an unentitled feature. 404 and 422 have never
  // been seen and rest on the status class alone.
  it.each([400, 404, 422])('classifies %i as a rejected request', (status) => {
    expect(classifyTecDocStatus(status)).toBe(TecDocFailure.Rejected);
  });

  it.each([429, 500, 502, 503, 504])(
    'classifies %i as unavailable',
    (status) => {
      expect(classifyTecDocStatus(status)).toBe(TecDocFailure.Unavailable);
    },
  );

  // TecAlliance does not publish the full enum, so an unmapped code must land on
  // the retryable reading rather than blame the caller for a request we cannot
  // prove was wrong.
  it.each([0, 204, 302])(
    'falls back to unavailable for the unmapped status %i',
    (status) => {
      expect(classifyTecDocStatus(status)).toBe(TecDocFailure.Unavailable);
    },
  );
});
