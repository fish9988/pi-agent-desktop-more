declare module "word-extractor" {
  export interface ExtractedWordDocument {
    getBody(): string;
    getHeaders(options?: { includeFooters?: boolean }): string;
    getFootnotes(): string;
    getEndnotes(): string;
  }
  export default class WordExtractor {
    extract(input: string | Buffer): Promise<ExtractedWordDocument>;
  }
}

declare module "jszip" {
  export interface JSZipObject {
    name: string;
    dir: boolean;
    async(type: "string" | "base64"): Promise<string>;
  }
  export default class JSZip {
    files: Record<string, JSZipObject>;
    static loadAsync(data: Buffer | Uint8Array): Promise<JSZip>;
  }
}
