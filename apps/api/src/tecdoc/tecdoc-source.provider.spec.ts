import { ConfigService } from '@nestjs/config';
import { TecDocMockClient } from './tecdoc-mock-client';
import { TecDocTransport } from './tecdoc-transport';
import { tecDocSourceProvider } from './tecdoc-source.provider';

class ExampleTecDoc {
  constructor(readonly transport: TecDocTransport) {}
}

type Factory = (
  config: ConfigService,
  transport: TecDocTransport,
  mock: TecDocMockClient,
) => unknown;

function build(tecdocMock: string | undefined) {
  const provider = tecDocSourceProvider(ExampleTecDoc) as {
    provide: unknown;
    inject: unknown[];
    useFactory: Factory;
  };
  const transport = {} as TecDocTransport;
  const mock = new TecDocMockClient();

  const config = {
    get: jest.fn(() => tecdocMock),
  } as unknown as ConfigService;

  return { provider, transport, mock, config };
}

describe('tecDocSourceProvider', () => {
  it('registers the source class as its own injection token', () => {
    const { provider } = build(undefined);

    expect(provider.provide).toBe(ExampleTecDoc);
    expect(provider.inject).toEqual([
      ConfigService,
      TecDocTransport,
      TecDocMockClient,
    ]);
  });

  it('builds the real source on the shared transport', () => {
    const { provider, transport, mock, config } = build('false');

    const source = provider.useFactory(config, transport, mock);

    expect(source).toBeInstanceOf(ExampleTecDoc);
    expect((source as ExampleTecDoc).transport).toBe(transport);
  });

  it('substitutes the mock when TECDOC_MOCK is on', () => {
    const { provider, transport, mock, config } = build('true');

    expect(provider.useFactory(config, transport, mock)).toBe(mock);
  });

  // Only the exact string turns it on, so an unset or misspelled variable leaves
  // a deployment talking to the real service rather than silently serving
  // fixtures as if they were catalogue data.
  it('uses the real source when the flag is absent', () => {
    const { provider, transport, mock, config } = build(undefined);

    expect(provider.useFactory(config, transport, mock)).toBeInstanceOf(
      ExampleTecDoc,
    );
  });
});
