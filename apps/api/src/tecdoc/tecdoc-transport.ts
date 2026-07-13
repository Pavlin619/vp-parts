import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
 * mapping.
 */
@Injectable()
export class TecDocTransport {
  private readonly logger = new Logger(TecDocTransport.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly providerId: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('TECDOC_BASE_URL')!;
    this.apiKey = this.config.get<string>('TECDOC_API_KEY')!;
    this.providerId = Number(this.config.get<string>('TECDOC_PROVIDER_ID'));
  }

  async call<T>(
    functionName: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}/services/TecdocToCatDLB.jsonEndpoint`;
    const body = JSON.stringify({
      [functionName]: { provider: this.providerId, ...params },
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      this.logger.error(
        `TecDoc API error ${response.status} for ${functionName}`,
      );
      throw new Error(`TecDoc API error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }
}
