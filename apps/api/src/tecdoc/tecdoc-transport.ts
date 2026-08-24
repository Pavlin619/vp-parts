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
 * `provider` is the ProviderId assigned by TecAlliance during onboarding, and
 * is optional here — see {@link readProviderId}.
 *
 * Full API contract and interactive test client:
 *   https://webservice.tecalliance.services/pegasus-3-0/info/
 *
 * This transport is the single shared HTTP seam every feature TecDoc source
 * calls; the per-feature classes own only their request params and response
 * mapping. It is also the only place that decides whether a call failed: see
 * {@link TECDOC_SUCCESS_STATUS} for why the HTTP status alone is not enough.
 */
/**
 * Node leaves `fetch` without a deadline, so a connection TecAlliance accepts
 * but never answers blocks for ~300s and takes a handler with it. Long enough
 * that a genuinely slow catalogue search still completes.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

@Injectable()
export class TecDocTransport {
  private readonly logger = new Logger(TecDocTransport.name);
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly providerId: number | undefined;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.endpoint = `${this.config.get<string>('TECDOC_BASE_URL')}/services/TecdocToCatDLB.jsonEndpoint`;
    this.apiKey = this.config.get<string>('TECDOC_API_KEY')!;
    this.providerId = readProviderId(this.config);
    this.timeoutMs =
      Number(this.config.get<string>('TECDOC_TIMEOUT_MS')) ||
      DEFAULT_TIMEOUT_MS;
  }

  /**
   * One TecDoc call, deadlined but otherwise unpaced.
   *
   * There is deliberately no process-wide cap on how many of these run at
   * once. TecAlliance publishes no rate limit, so any figure would be a guess,
   * and a cap has to queue what it holds back: a queue then needs a deadline or
   * a slow upstream becomes unbounded latency, and that deadline sheds ordinary
   * single-call reads as soon as more visitors browse at once than the guess
   * allows. The one caller that genuinely fans out bounds itself instead — see
   * `mapWithConcurrency` in `LinkedVehiclesTecDoc.getVehiclesByIds`. If
   * TecAlliance ever starts rejecting us, a cap here is the answer, sized to
   * whatever they tell us rather than to a guess.
   */
  async call<T>(
    functionName: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    // One deadline for the whole exchange, shared with the body read below: a
    // response whose headers arrive promptly can still stall mid-stream.
    const signal = AbortSignal.timeout(this.timeoutMs);

    const response = await this.post(functionName, params, signal);
    const payload = await this.readJson<T>(response, functionName);

    this.assertSucceeded(payload, functionName);

    return payload;
  }

  private async post(
    functionName: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<Response> {
    const body = this.requestBody(functionName, params);

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body,
        signal,
      });
    } catch (error) {
      // No response at all: timed out, DNS failure, refused connection, dropped
      // socket. TecAlliance's own status page reports these regularly, so treat
      // them as the transient outages they are rather than a bug in the caller.
      this.unavailable(functionName, this.describeTransportError(error));
    }

    if (!response.ok) {
      this.fail(functionName, response.status, response.statusText);
    }

    return response;
  }

  /**
   * An unconfigured provider is left out of the body rather than sent empty:
   * `provider: null` is a value TecDoc rejects, absence is not.
   */
  private requestBody(
    functionName: string,
    params: Record<string, unknown>,
  ): string {
    const call =
      this.providerId === undefined
        ? params
        : { provider: this.providerId, ...params };

    return JSON.stringify({ [functionName]: call });
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
      this.unavailable(
        functionName,
        isTimeout(error)
          ? this.describeTransportError(error)
          : `returned a non-JSON body: ${describe(error)}`,
      );
    }
  }

  /** Separated in the log because the two point at different runbooks. */
  private describeTransportError(error: unknown): string {
    return isTimeout(error)
      ? `timed out after ${this.timeoutMs}ms`
      : `unreachable: ${describe(error)}`;
  }

  private unavailable(functionName: string, reason: string): never {
    this.logger.error(`TecDoc ${functionName} ${reason}`);

    throw new CatalogUnavailableException();
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
 * TecAlliance resolves entitlement from `X-Api-Key`, so a call that carries no
 * `provider` at all is answered in full, while a ProviderId belonging to
 * somebody else is refused outright with "Access not allowed". Sending nothing
 * therefore beats sending a guess, and the value is optional.
 *
 * A malformed one still fails fast. Without this, `TECDOC_PROVIDER_ID=TODO`
 * would read as "send no provider" and quietly work, so the day a real
 * ProviderId is pasted in wrong nothing would say so.
 *
 * [VERIFY-TC] Whether a real ProviderId narrows or widens what the same key
 * returns is unverified — we have never held one. If a subscription turns out to
 * scope the assortment, article counts change the day one is configured.
 */
function readProviderId(config: ConfigService): number | undefined {
  const configured = config.get<string>('TECDOC_PROVIDER_ID');

  if (configured === undefined || configured === '') {
    return undefined;
  }

  const providerId = Number(configured);

  if (!Number.isInteger(providerId) || providerId <= 0) {
    throw new Error(
      'TECDOC_PROVIDER_ID must be a positive integer (the ProviderId issued by ' +
        'TecAlliance) or left unset',
    );
  }

  return providerId;
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

/** `AbortSignal.timeout` rejects with a DOMException named TimeoutError. */
function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}
