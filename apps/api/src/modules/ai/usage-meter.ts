/** Akumulasi pemakaian LLM untuk satu permintaan user (bisa beberapa panggilan: retry, iterasi tool). */
export class UsageMeter {
  promptTokens = 0;
  completionTokens = 0;
  latencyMs = 0;
  calls = 0;

  add(usage: { promptTokens?: number; completionTokens?: number; latencyMs: number }): void {
    this.promptTokens += usage.promptTokens ?? 0;
    this.completionTokens += usage.completionTokens ?? 0;
    this.latencyMs += usage.latencyMs;
    this.calls += 1;
  }
}
