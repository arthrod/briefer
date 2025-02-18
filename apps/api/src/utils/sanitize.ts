/**
 * Sanitizes the input string by removing HTML tags, specific unwanted characters,
 * control characters, and extraneous whitespace.
 *
 * This function performs the following steps:
 * 1. Returns an empty string if the input is falsy.
 * 2. Removes HTML tags via a regular expression.
 * 3. Eliminates angle brackets (< and >), single quotes, and double quotes.
 * 4. Removes control characters in the ASCII range 0-31 and 127.
 * 5. Trims leading and trailing whitespace.
 *
 * @param input - The input text to sanitize.
 * @returns The sanitized string.
 *
 * @example
 * // Returns "Example" after removing tags and unwanted characters.
 * sanitizeInput("<p>Example</p>"); // "Example"
 */
export function sanitizeInput(input: string): string {
  if (!input) return ''
  input = input.replace(/<[^>]*>/g, '')
  input = input.replace(/[<>'"]/g, '')
  input = input.replace(/[\x00-\x1F\x7F]/g, '')
  return input.trim()
}
