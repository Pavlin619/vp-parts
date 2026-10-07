import {
  DEFAULT_CHECKPOINT_PATH,
  DEFAULT_REPORT_PATH,
  InvalidArgumentsError,
  parseRunArguments,
} from './run-arguments';

describe('parseRunArguments', () => {
  it('defaults to a fresh-looking full run with the standard file names', () => {
    expect(parseRunArguments([])).toEqual({
      isResume: false,
      isFresh: false,
      isDryRun: false,
      checkpointPath: DEFAULT_CHECKPOINT_PATH,
      reportPath: DEFAULT_REPORT_PATH,
    });
  });

  it('reads every flag', () => {
    expect(
      parseRunArguments([
        '--resume',
        '--dry-run',
        '--only',
        '82,7',
        '--limit',
        '20',
        '--interval-ms',
        '500',
        '--checkpoint',
        'c.jsonl',
        '--report',
        'r.json',
      ]),
    ).toEqual({
      isResume: true,
      isFresh: false,
      isDryRun: true,
      onlyTypeIds: [82, 7],
      limit: 20,
      intervalMs: 500,
      checkpointPath: 'c.jsonl',
      reportPath: 'r.json',
    });
  });

  it.each([
    [['--nope']],
    [['--limit']],
    [['--limit', 'abc']],
    [['--only', '1,x']],
    [['--resume', '--fresh']],
  ])('rejects %j', (argv) => {
    expect(() => parseRunArguments(argv)).toThrow(InvalidArgumentsError);
  });
});
