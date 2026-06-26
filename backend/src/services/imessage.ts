import { IMessageSDK } from '@photon-ai/imessage-kit';

let _sdk: IMessageSDK | null = null;

export function getSDK(): IMessageSDK {
  if (!_sdk) _sdk = new IMessageSDK();
  return _sdk;
}

export async function sendMessage(to: string, text: string): Promise<{ sent: boolean; reason?: string }> {
  try {
    const sdk = getSDK();
    await sdk.send({ to, text });
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error('[imessage] send error:', reason);
    return { sent: false, reason };
  }
}
