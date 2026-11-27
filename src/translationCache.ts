/** 同じ本文・同じ設定の翻訳を 1 回だけ走らせる LRU キャッシュ。 */

export class TranslationCache {
  private readonly values = new Map<string, string>();
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(private readonly maxEntries = 300) {}

  get(key: string, create: () => Promise<string>): Promise<string> {
    const cached = this.values.get(key);
    if (cached !== undefined) {
      this.values.delete(key);
      this.values.set(key, cached);
      return Promise.resolve(cached);
    }

    const running = this.inflight.get(key);
    if (running !== undefined) return running;

    const task = create()
      .then((value) => {
        this.values.set(key, value);
        this.trim();
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, task);
    return task;
  }

  clear(): void {
    this.values.clear();
    this.inflight.clear();
  }

  private trim(): void {
    while (this.values.size > this.maxEntries) {
      const oldest = this.values.keys().next().value;
      if (oldest === undefined) return;
      this.values.delete(oldest);
    }
  }
}
