import { parse, printParseErrorCode, stripComments } from 'jsonc-parser';
import type { ParseError, ParseOptions } from 'jsonc-parser';
import { LinesAndColumns } from 'lines-and-columns';

export { stripComments as stripJsonComments };

export interface JsonParseOptions extends ParseOptions {
  /**
   * Expect JSON with javascript-style
   * @default false
   */
  expectComments?: boolean;
  /**
   * Disallow javascript-style
   * @default false
   */
  disallowComments?: boolean;

  /**
   * Allow trailing commas in the JSON content
   */
  allowTrailingComma?: boolean;
}

export interface JsonSerializeOptions {
  /**
   * the whitespaces to add as indentation to make the output more readable.
   * @default 2
   */
  spaces?: number;
}

/**
 * Parses the given JSON string and returns the object the JSON content represents.
 * By default javascript-style comments and trailing commas are allowed.
 *
 * @param input JSON content as string
 * @param options JSON parse options
 * @returns Object the JSON content represents
 */
export function parseJson<T extends object = any>(
  input: string,
  options?: JsonParseOptions
): T {
  try {
    return JSON.parse(input);
  } catch {}

  options = { allowTrailingComma: true, ...options };

  const errors: ParseError[] = [];
  const result: T = parse(input, errors, options);

  if (errors.length > 0) {
    throw new Error(formatParseError(input, errors[0], 3));
  }

  return result;
}

/**
 * Nicely formats a JSON error with context
 *
 * @param input JSON content as string
 * @param parseError jsonc ParseError
 * @param numContextLine Number of context lines to show before and after
 * @returns
 */
function formatParseError(
  input: string,
  parseError: ParseError,
  numContextLine: number
) {
  const { error, offset, length } = parseError;
  const { line, column } = new LinesAndColumns(input).locationForIndex(offset);

  const errorLines = [
    `${printParseErrorCode(error)} in JSON at ${line + 1}:${column + 1}`,
  ];

  const inputLines = input.split(/\r?\n/);
  const firstLine = Math.max(0, line - numContextLine);
  const lastLine = Math.min(inputLines.length - 1, line + numContextLine);

  if (firstLine > 0) {
    errorLines.push('...');
  }

  for (let currentLine = firstLine; currentLine <= lastLine; currentLine++) {
    const lineNumber = `${currentLine + 1}: `;
    errorLines.push(`${lineNumber}${inputLines[currentLine]}`);
    if (line == currentLine) {
      errorLines.push(
        `${' '.repeat(column + lineNumber.length)}${'^'.repeat(
          length
        )} ${printParseErrorCode(error)}`
      );
    }
  }

  if (lastLine < inputLines.length - 1) {
    errorLines.push('...');
  }

  errorLines.push('');

  return errorLines.join('\n');
}

/**
 * Serializes the given data to a JSON string.
 * By default the JSON string is formatted with a 2 space indentation to be easy readable.
 *
 * @param input Object which should be serialized to JSON
 * @param options JSON serialize options
 * @returns the formatted JSON representation of the object
 */
export function serializeJson<T extends object = object>(
  input: T,
  options?: JsonSerializeOptions
): string {
  return JSON.stringify(input, null, options?.spaces ?? 2) + '\n';
}
