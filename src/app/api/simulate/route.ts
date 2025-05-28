/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import LaunchDarkly from 'launchdarkly-node-server-sdk';
import { randomUUID } from 'crypto';

// Helper function to add delay
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const { sdkKey, flagKey, events, userCount, contexts } = await req.json();

  if (!sdkKey || !flagKey || !events || !userCount || !contexts) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const client = LaunchDarkly.init(sdkKey);
  await client.waitForInitialization();

  for (let i = 0; i < userCount; i++) {
    const multiContext: any = { kind: 'multi' };
    for (const ctx of contexts) {
      const attributes: any = { key: randomUUID() };
      console.log(`Attributes: ${JSON.stringify(attributes)}`);
      for (const attr of ctx.attributes) {
        attributes[attr.key] = attr.value;
      }
      multiContext[ctx.kind] = attributes;
    }

    await client.variation(flagKey, multiContext, 'default');

    for (const event of events) {
      if (Math.random() < event.probability) {
        client.track(event.name, multiContext);
        console.log(`Sent event '${event.name}' for user index ${i}`);
        await sleep(500); // 500ms delay between events
      }
    }
  }

  await client.flush();
  await client.close();

  return NextResponse.json({ message: 'Simulation complete' });
}