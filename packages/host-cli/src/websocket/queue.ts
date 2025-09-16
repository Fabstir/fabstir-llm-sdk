export interface QueuedMessage {
  data: any;
  timestamp: Date;
  attempts?: number;
}

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private maxSize: number = 1000;
  private enabled: boolean = true;

  constructor(maxSize?: number) {
    if (maxSize !== undefined) {
      this.maxSize = maxSize;
    }
  }

  enqueue(data: any): void {
    if (!this.enabled) {
      return;
    }

    const message: QueuedMessage = {
      data,
      timestamp: new Date(),
      attempts: 0
    };

    // If queue is at max size, drop oldest message
    if (this.queue.length >= this.maxSize) {
      this.queue.shift();
    }

    this.queue.push(message);
  }

  dequeue(): any {
    const message = this.queue.shift();
    return message ? message.data : null;
  }

  peek(): any {
    const message = this.queue[0];
    return message ? message.data : null;
  }

  size(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  clear(): void {
    this.queue = [];
  }

  drainAll(): any[] {
    const messages = this.queue.map(m => m.data);
    this.clear();
    return messages;
  }

  setMaxSize(size: number): void {
    this.maxSize = size;

    // Trim queue if needed
    while (this.queue.length > this.maxSize) {
      this.queue.shift();
    }
  }

  getMaxSize(): number {
    return this.maxSize;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getOldestMessage(): QueuedMessage | null {
    return this.queue[0] || null;
  }

  getNewestMessage(): QueuedMessage | null {
    return this.queue[this.queue.length - 1] || null;
  }

  getMessageAge(index: number): number {
    const message = this.queue[index];
    if (!message) {
      return 0;
    }
    return Date.now() - message.timestamp.getTime();
  }

  removeOldMessages(maxAge: number): number {
    const now = Date.now();
    const before = this.queue.length;

    this.queue = this.queue.filter(message => {
      const age = now - message.timestamp.getTime();
      return age <= maxAge;
    });

    return before - this.queue.length;
  }

  incrementAttempts(index: number): void {
    const message = this.queue[index];
    if (message) {
      message.attempts = (message.attempts || 0) + 1;
    }
  }

  getMessages(): any[] {
    return this.queue.map(m => m.data);
  }

  getQueueInfo(): {
    size: number;
    maxSize: number;
    oldestAge?: number;
    newestAge?: number;
    enabled: boolean;
  } {
    const oldest = this.getOldestMessage();
    const newest = this.getNewestMessage();
    const now = Date.now();

    return {
      size: this.queue.length,
      maxSize: this.maxSize,
      oldestAge: oldest ? now - oldest.timestamp.getTime() : undefined,
      newestAge: newest ? now - newest.timestamp.getTime() : undefined,
      enabled: this.enabled
    };
  }

  // Priority queue functionality
  enqueuePriority(data: any, priority: number = 0): void {
    if (!this.enabled) {
      return;
    }

    const message: QueuedMessage & { priority?: number } = {
      data,
      timestamp: new Date(),
      attempts: 0,
      priority
    };

    // Find insertion point based on priority
    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      const existing = this.queue[i] as any;
      if ((existing.priority || 0) < priority) {
        insertIndex = i;
        break;
      }
    }

    // If queue is at max size and new item would be added, drop lowest priority
    if (this.queue.length >= this.maxSize) {
      if (insertIndex === this.queue.length) {
        // New item has lowest priority, don't add it
        return;
      }
      // Remove lowest priority item (last item)
      this.queue.pop();
    }

    this.queue.splice(insertIndex, 0, message);
  }
}