/** Strip control chars, markdown fences, and fix invalid backslashes inside JSON strings. */
export function sanitizeAiJsonString(content: string): string {
  let sanitizedContent = content
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/^```[a-zA-Z]*\n|```$/g, '')

  let inString = false
  let result = ''
  for (let i = 0; i < sanitizedContent.length; i++) {
    const char = sanitizedContent[i]

    if (char === '"') {
      let backslashCount = 0
      let j = i - 1
      while (j >= 0 && sanitizedContent[j] === '\\') {
        backslashCount++
        j--
      }
      if (backslashCount % 2 === 0) {
        inString = !inString
      }
      result += char
      continue
    }

    if (inString && char === '\\') {
      const nextChar = i + 1 < sanitizedContent.length ? sanitizedContent[i + 1] : ''
      const validEscapes = ['"', '\\', '/', 'b', 'f', 'n', 'r', 't']
      const isUnicodeEscape =
        nextChar === 'u' &&
        i + 5 < sanitizedContent.length &&
        /^u[0-9a-fA-F]{4}/.test(sanitizedContent.substring(i + 1, i + 6))

      if (validEscapes.includes(nextChar) || isUnicodeEscape) {
        result += char
      } else {
        result += '\\\\'
      }
    } else {
      result += char
    }
  }
  return result
}
