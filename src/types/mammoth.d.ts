declare module 'mammoth' {
  interface ExtractRawTextResult {
    value: string
    messages: Array<{ type?: string; message?: string }>
  }
  const mammoth: {
    extractRawText (options: { buffer: Buffer }): Promise<ExtractRawTextResult>
  }
  export default mammoth
}
