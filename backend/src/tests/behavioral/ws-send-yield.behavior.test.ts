import { describe, it, expect } from 'vitest';

describe('sendEvent event loop yield', () => {
  it('yields to the event loop between rapid sends so I/O can process', async () => {
    // Simulate the sendEvent pattern: fire-and-forget ws.send + setImmediate yield
    const ioProcessed: number[] = [];
    let sendCount = 0;

    // Simulate I/O callback (like proxy pipe drain)
    const ioCallback = setImmediate(() => {
      ioProcessed.push(sendCount);
    });

    // Simulate rapid sendEvent calls (like the test_result loop)
    async function sendEvent() {
      sendCount++;
      // ws.send() would happen here (sync)
      await new Promise<void>(resolve => { setImmediate(resolve); });
    }

    // Fire 5 sends in a loop (like the test_result for loop)
    for (let i = 0; i < 5; i++) {
      await sendEvent();
    }

    // I/O callback should have fired between sends, not after all of them
    clearImmediate(ioCallback);
    expect(ioProcessed.length).toBeGreaterThan(0);
    expect(ioProcessed[0]).toBeLessThan(5); // I/O processed before all sends completed
  });
});
