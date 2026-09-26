import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryRequestRejectedException,
  DeliveryUnavailableException,
} from '../delivery.exceptions';
import type { EcontError } from './econt-response';

const DEFAULT_TIMEOUT_MS = 10_000;

/** Econt answers every refused request with this status and an error tree as the body. */
const ECONT_ERROR_STATUS = 517;

const TOO_MANY_REQUESTS = 429;

/** A refusal still surfaces as INTERNAL_ERROR unless the caller recognises it in `refusal`. */
export class EcontRefusedException extends DeliveryRequestRejectedException {
  constructor(readonly refusal: EcontError) {
    super();
  }
}

/**
 * Econt's JSON services: `POST {base}/{Service}.{method}.json`. Account calls use
 * basic auth; nomenclatures (offices, cities) are public and read from production,
 * whose data the demo lacks — see docs/DELIVERY-PROVIDERS.md.
 */
@Injectable()
export class EcontTransport {
  private readonly logger = new Logger(EcontTransport.name);
  private readonly baseUrl: string;
  private readonly nomenclatureBaseUrl: string;
  private readonly authorization: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('ECONT_BASE_URL')!;
    this.nomenclatureBaseUrl = config.get<string>('ECONT_OFFICES_BASE_URL')!;
    this.authorization = basicAuth(
      config.get<string>('ECONT_USERNAME')!,
      config.get<string>('ECONT_PASSWORD')!,
    );
    this.timeoutMs =
      Number(config.get('ECONT_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS;
  }

  call(service: string, body: object): Promise<unknown> {
    return this.post(`${this.baseUrl}/${service}.json`, body, {
      Authorization: this.authorization,
    });
  }

  readNomenclature(service: string, body: object): Promise<unknown> {
    return this.post(`${this.nomenclatureBaseUrl}/${service}.json`, body, {});
  }

  /** Answers the parsed body unchecked; each caller guards the fields it reads. */
  private async post(
    url: string,
    body: object,
    headers: Record<string, string>,
  ): Promise<unknown> {
    const response = await this.send(url, body, headers);

    if (
      response.status === ECONT_ERROR_STATUS ||
      isClientError(response.status)
    ) {
      await this.reject(url, response);
    }

    if (!response.ok) {
      this.unavailable(url, `answered HTTP ${response.status}`);
    }

    return this.readJson(url, response);
  }

  private async send(
    url: string,
    body: object,
    headers: Record<string, string>,
  ): Promise<Response> {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      this.unavailable(url, `unreachable: ${describeError(error)}`);
    }
  }

  private async readJson(url: string, response: Response): Promise<unknown> {
    try {
      return (await response.json()) as unknown;
    } catch (error) {
      this.unavailable(
        url,
        `returned a non-JSON body: ${describeError(error)}`,
      );
    }
  }

  private async reject(url: string, response: Response): Promise<never> {
    const error = (await response.json().catch(() => ({}))) as EcontError;

    this.logger.error(
      `Econt ${url} refused (HTTP ${response.status}): ${errorMessagesOf(error).join(' / ')}`,
    );

    throw new EcontRefusedException(error);
  }

  private unavailable(url: string, reason: string): never {
    this.logger.error(`Econt ${url} ${reason}`);

    throw new DeliveryUnavailableException();
  }
}

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function isClientError(status: number): boolean {
  return status >= 400 && status < 500 && status !== TOO_MANY_REQUESTS;
}

/** Econt nests the actionable message several levels down, wrapped in blank ones. */
function errorMessagesOf(error: EcontError): string[] {
  const own = error.message?.trim()
    ? [`${error.type}: ${error.message.trim()}`]
    : [];

  return [...own, ...(error.innerErrors ?? []).flatMap(errorMessagesOf)];
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
