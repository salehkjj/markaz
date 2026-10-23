export const BASE_PATH = '/markaz';

export function appUrl(origin: string): string {
  return `${origin}${BASE_PATH}/`;
}
