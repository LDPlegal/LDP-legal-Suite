// Declaración minimal para word-extractor (no tiene @types/ oficial).
// Solo expongo los métodos que usamos en lib/ocr/doc-legacy.ts.

declare module "word-extractor" {
  export interface WordExtractedDocument {
    getBody(): string;
    getHeaders(opts?: { includeFooters?: boolean }): string;
    getFooters(): string;
    getAnnotations(): string;
    getEndnotes(): string;
    getFootnotes(): string;
    getTextboxes(opts?: { includeHeadersAndFooters?: boolean }): string;
  }

  export default class WordExtractor {
    constructor();
    extract(filePathOrBuffer: string | Buffer): Promise<WordExtractedDocument>;
  }
}
