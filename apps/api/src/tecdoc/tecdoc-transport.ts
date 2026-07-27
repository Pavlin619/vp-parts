import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CatalogRequestRejectedException,
  CatalogUnavailableException,
} from './catalog.exception';
import {
  TECDOC_SUCCESS_STATUS,
  TecDocFailure,
  TecDocResponseStatus,
  classifyTecDocStatus,
} from './tecdoc-status';

/**
 * TecDoc Pegasus 3.0 is a JSON RPC service — NOT a REST API.
 *
 * All calls are HTTP POST to a single endpoint:
 *   {TECDOC_BASE_URL}/services/TecdocToCatDLB.jsonEndpoint
 *
 * Every request body is a JSON object keyed by the function name:
 *   { "getFunctionName": { "provider": PROVIDER_ID, ...params } }
 *
 * The provider field is mandatory on every call. It is the ProviderId
 * assigned by TecAlliance during onboarding.
 *
 * Full API contract and interactive test client:
 *   https://webservice.tecalliance.services/pegasus-3-0/info/
 *
 * This transport is the single shared HTTP seam every feature TecDoc source
 * calls; the per-feature classes own only their request params and response
 * mapping. It is also the only place that decides whether a call failed: see
 * {@link TECDOC_SUCCESS_STATUS} for why the HTTP status alone is not enough.
 */
@Injectable()
export class TecDocTransport {
  private readonly logger = new Logger(TecDocTransport.name);
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly providerId: number;

  constructor(private readonly config: ConfigService) {
    this.endpoint = `${this.config.get<string>('TECDOC_BASE_URL')}/services/TecdocToCatDLB.jsonEndpoint`;
    this.apiKey = this.config.get<string>('TECDOC_API_KEY')!;
    this.providerId = Number(this.config.get<string>('TECDOC_PROVIDER_ID'));

    // The Joi schema already guarantees this in the running app; the guard keeps
    // a directly constructed transport (a script, a test) from posting
    // `provider: null` and blaming TecDoc for the "Access not allowed" it earns.
    if (!Number.isInteger(this.providerId) || this.providerId <= 0) {
      throw new Error(
        'TECDOC_PROVIDER_ID must be a positive integer (the ProviderId issued by TecAlliance)',
      );
    }
  }

  async call<T>(
    functionName: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.post(functionName, params);
    const payload = await this.readJson<T>(response, functionName);

    this.assertSucceeded(payload, functionName);

    return payload;
  }

  private async post(
    functionName: string,
    params: Record<string, unknown>,
  ): Promise<Response> {
    const body = JSON.stringify({
      [functionName]: { provider: this.providerId, ...params },
    });

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body,
      });
    } catch (error) {
      // No response at all: DNS failure, refused connection, dropped socket.
      // TecAlliance's own status page reports these regularly, so treat them as
      // the transient outages they are rather than as a bug in the caller.
      this.logger.error(
        `TecDoc ${functionName} unreachable: ${describe(error)}`,
      );
      throw new CatalogUnavailableException();
    }

    if (!response.ok) {
      this.fail(functionName, response.status, response.statusText);
    }

    return response;
  }

  private async readJson<T>(
    response: Response,
    functionName: string,
  ): Promise<T & TecDocResponseStatus> {
    try {
      return (await response.json()) as T & TecDocResponseStatus;
    } catch (error) {
      // A 200 that is not JSON is almost always an intermediary's error page
      // rather than TecDoc itself, so it is retryable like any other outage.
      this.logger.error(
        `TecDoc ${functionName} returned a non-JSON body: ${describe(error)}`,
      );
      throw new CatalogUnavailableException();
    }
  }

  /**
   * Enforces the in-body status envelope. A missing `status` is accepted as
   * success on purpose: it is mandatory in the WSDL, but treating its absence as
   * a failure would break any function whose JSON envelope we have not confirmed
   * against the Test Client for the sake of a case we have never observed.
   */
  private assertSucceeded(
    payload: TecDocResponseStatus,
    functionName: string,
  ): void {
    if (
      payload.status === undefined ||
      payload.status === TECDOC_SUCCESS_STATUS
    ) {
      return;
    }

    this.fail(functionName, payload.status, payload.statusText);
  }

  /**
   * Logs the full upstream detail and throws the exception matching what the
   * failure means. `statusText` is TecDoc's own wording ("Access not allowed") —
   * useful in a log line, never in a response body.
   */
  private fail(
    functionName: string,
    status: number,
    statusText?: string,
  ): never {
    const failure = classifyTecDocStatus(status);
    const detail = statusText ? ` statusText="${statusText}"` : '';
    this.logger.error(
      `TecDoc ${functionName} failed (${failure}): status=${status}${detail}`,
    );

    throw exceptionFor(failure);
  }
}

/**
 * No `default` arm on purpose: adding a {@link TecDocFailure} without deciding
 * what the client should see is then a compile error rather than a silent 500.
 */
function exceptionFor(failure: TecDocFailure): HttpException {
  switch (failure) {
    case TecDocFailure.Unavailable:
      return new CatalogUnavailableException();

    case TecDocFailure.Denied:
    case TecDocFailure.Rejected:
      return new CatalogRequestRejectedException();
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
