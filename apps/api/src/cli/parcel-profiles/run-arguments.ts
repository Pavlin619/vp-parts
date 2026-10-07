export interface RunArguments {
  isResume: boolean;
  isFresh: boolean;
  isDryRun: boolean;
  onlyTypeIds?: number[];
  limit?: number;
  intervalMs?: number;
  checkpointPath: string;
  reportPath: string;
}

export const DEFAULT_CHECKPOINT_PATH = 'parcel-profiles-checkpoint.jsonl';
export const DEFAULT_REPORT_PATH = 'parcel-profiles-report.json';

export class InvalidArgumentsError extends Error {}

export function parseRunArguments(argv: string[]): RunArguments {
  const parsed: RunArguments = {
    isResume: false,
    isFresh: false,
    isDryRun: false,
    checkpointPath: DEFAULT_CHECKPOINT_PATH,
    reportPath: DEFAULT_REPORT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    switch (flag) {
      case '--resume':
        parsed.isResume = true;
        break;
      case '--fresh':
        parsed.isFresh = true;
        break;
      case '--dry-run':
        parsed.isDryRun = true;
        break;
      case '--only':
        parsed.onlyTypeIds = integersOf(flag, argv[++index]);
        break;
      case '--limit':
        parsed.limit = integersOf(flag, argv[++index])[0];
        break;
      case '--interval-ms':
        parsed.intervalMs = integersOf(flag, argv[++index])[0];
        break;
      case '--checkpoint':
        parsed.checkpointPath = valueOf(flag, argv[++index]);
        break;
      case '--report':
        parsed.reportPath = valueOf(flag, argv[++index]);
        break;
      default:
        throw new InvalidArgumentsError(`Unknown argument ${flag}`);
    }
  }

  if (parsed.isResume && parsed.isFresh) {
    throw new InvalidArgumentsError('--resume and --fresh cannot be combined');
  }

  return parsed;
}

function valueOf(flag: string, value: string | undefined): string {
  if (value === undefined || value.startsWith('--')) {
    throw new InvalidArgumentsError(`${flag} needs a value`);
  }

  return value;
}

function integersOf(flag: string, value: string | undefined): number[] {
  const numbers = valueOf(flag, value).split(',').map(Number);

  if (numbers.some((number) => !Number.isInteger(number) || number < 0)) {
    throw new InvalidArgumentsError(`${flag} needs whole numbers`);
  }

  return numbers;
}
