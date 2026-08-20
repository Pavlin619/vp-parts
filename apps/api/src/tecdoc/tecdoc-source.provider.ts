import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TecDocMockClient } from './tecdoc-mock-client';
import { TecDocTransport } from './tecdoc-transport';

/**
 * A per-feature TecDoc source: a class whose only dependency is the shared
 * transport, so the mock can stand in for it wholesale.
 */
type TecDocSource<T> = new (transport: TecDocTransport) => T;

/**
 * Registers a TecDoc source, swapped for {@link TecDocMockClient} when
 * `TECDOC_MOCK` is on.
 *
 * The mock substitutes structurally rather than by implementing an interface,
 * which is why the swap happens once per source in a factory instead of being
 * declared on the class: every source is replaced by the same object, and it
 * answers the union of all their methods.
 */
export function tecDocSourceProvider<T>(source: TecDocSource<T>): Provider {
  return {
    provide: source,
    inject: [ConfigService, TecDocTransport, TecDocMockClient],
    useFactory: (
      config: ConfigService,
      transport: TecDocTransport,
      mock: TecDocMockClient,
    ): T | TecDocMockClient =>
      config.get<string>('TECDOC_MOCK') === 'true'
        ? mock
        : new source(transport),
  };
}
