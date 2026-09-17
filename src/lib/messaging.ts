import type { CapturedProfile } from './types';

export type ExtensionMessage =
  | { type: 'CAPTURE_PROFILES'; profiles: CapturedProfile[]; sourceType: 'followers_list' | 'post_comments'; sourceRef: string }
  | { type: 'CAPTURE_RESULT'; added: number; skipped: number }
  | { type: 'INSERT_TEMPLATE_DONE' };

export function sendMessage<T extends ExtensionMessage>(message: T): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

export function onMessage(
  handler: (message: ExtensionMessage, sender: chrome.runtime.MessageSender) => void | Promise<unknown>,
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = handler(message as ExtensionMessage, sender);
    if (result instanceof Promise) {
      result.then(sendResponse);
      return true;
    }
    return false;
  });
}
