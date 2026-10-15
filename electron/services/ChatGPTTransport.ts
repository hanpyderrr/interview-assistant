import { net } from 'electron';

/** Follow the OS proxy configuration, like the browser used for authorization. */
export function chatGPTFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  return net.fetch(String(input), init);
}
