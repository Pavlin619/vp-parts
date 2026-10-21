/** The two Turnstile widget calls a challenge needs. */
export interface ChallengeWidget {
  execute: () => void;
  reset: () => void;
}

export class BotCheckFailedError extends Error {
  constructor() {
    super("The bot check did not pass");
    this.name = "BotCheckFailedError";
  }
}

interface PendingChallenge {
  resolve: (token: string) => void;
  reject: (error: BotCheckFailedError) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * One Turnstile challenge per order attempt, settled by the widget's callbacks.
 * Cloudflare accepts a token once, so every attempt after the first resets the
 * widget for a fresh one.
 */
export class BotCheckChallenge {
  private pending: PendingChallenge | null = null;
  private hasRun = false;

  constructor(
    private readonly widget: ChallengeWidget,
    private readonly timeoutMs: number,
  ) {}

  solve(): Promise<string> {
    this.fail();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(), this.timeoutMs);
      this.pending = { resolve, reject, timer };

      if (this.hasRun) {
        this.widget.reset();
      }
      this.hasRun = true;
      this.widget.execute();
    });
  }

  pass(token: string): void {
    this.pending?.resolve(token);
    this.clear();
  }

  fail(): void {
    this.pending?.reject(new BotCheckFailedError());
    this.clear();
  }

  private clear(): void {
    if (this.pending) {
      clearTimeout(this.pending.timer);
    }
    this.pending = null;
  }
}
