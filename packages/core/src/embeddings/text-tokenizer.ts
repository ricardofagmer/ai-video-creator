import { EmbeddingModelLoadError } from './embeddings.errors';

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTokenIdList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'number' && Number.isInteger(id) && id >= 0);
}

function parseJsonObject(bytes: Buffer, file: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new EmbeddingModelLoadError('tokenizer', file, { cause: error });
  }
  if (!isJsonObject(parsed)) throw new EmbeddingModelLoadError('tokenizer', file);
  return parsed;
}

/**
 * The pad token id named by `tokenizer_config.json` (`pad_token`, a string or `{ content }`),
 * looked up in `tokenizer.json` `added_tokens`. Padded positions carry attention mask 0, so they
 * change neither attention nor the mean; the id only has to exist in the vocabulary, and 0 does
 * for every vocabulary when the config names no pad token.
 */
function padTokenIdOf(tokenizerJson: JsonObject, tokenizerConfig: JsonObject): number {
  const padToken = tokenizerConfig['pad_token'];
  const content = isJsonObject(padToken) ? padToken['content'] : padToken;
  const addedTokens = tokenizerJson['added_tokens'];
  if (typeof content !== 'string' || !Array.isArray(addedTokens)) return 0;
  for (const token of addedTokens) {
    if (!isJsonObject(token) || token['content'] !== content) continue;
    const id = token['id'];
    if (typeof id === 'number' && Number.isInteger(id) && id >= 0) return id;
  }
  return 0;
}

export interface TextTokenizerSource {
  /** Pinned bytes of `tokenizer.json` and `tokenizer_config.json` (see `readPinnedModelFile`). */
  readonly tokenizerJson: Buffer;
  readonly tokenizerConfigJson: Buffer;
  /** Manifest-relative names, for error reasons only. */
  readonly tokenizerFile: string;
  readonly tokenizerConfigFile: string;
  /** The manifest's `maxInputTokens`. */
  readonly maxInputTokens: number;
}

/**
 * Text to token ids with `@huggingface/tokenizers` (option L, docs/vetting/0001). The library
 * receives two parsed JSON objects and never a URL or a model id, so it has nothing to download; it
 * is pure JavaScript and has no hub client. It is imported on first load, not at module load, so
 * a process that never searches by meaning never parses it.
 *
 * The encoded result is narrowed at runtime rather than trusted from the library's types, since
 * its 0.x API is young. Special tokens are added by the library's default.
 */
export class TextTokenizer {
  private constructor(
    private readonly encodeText: (text: string) => unknown,
    readonly padTokenId: number,
    private readonly maxInputTokens: number,
  ) {}

  static async create(source: TextTokenizerSource): Promise<TextTokenizer> {
    const tokenizerJson = parseJsonObject(source.tokenizerJson, source.tokenizerFile);
    const tokenizerConfig = parseJsonObject(source.tokenizerConfigJson, source.tokenizerConfigFile);
    const { Tokenizer } = await import('@huggingface/tokenizers');
    let tokenizer: InstanceType<typeof Tokenizer>;
    try {
      tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
    } catch (error) {
      throw new EmbeddingModelLoadError('tokenizer', source.tokenizerFile, { cause: error });
    }
    return new TextTokenizer((text) => tokenizer.encode(text), padTokenIdOf(tokenizerJson, tokenizerConfig), source.maxInputTokens);
  }

  /**
   * Token ids of one text, at most `maxInputTokens`. A longer sequence keeps its first
   * `maxInputTokens - 1` ids and its last id, the closing special token, so the model still sees
   * a well-formed sequence; the embedding document puts what matters first (B8).
   */
  encode(text: string): readonly number[] {
    const encoded = this.encodeText(text);
    const ids = isJsonObject(encoded) ? encoded['ids'] : undefined;
    if (!isTokenIdList(ids) || ids.length === 0) throw new EmbeddingModelLoadError('tokenizer');
    if (ids.length <= this.maxInputTokens) return ids;
    const closingId = ids[ids.length - 1];
    if (closingId === undefined || this.maxInputTokens < 2) return ids.slice(0, this.maxInputTokens);
    return [...ids.slice(0, this.maxInputTokens - 1), closingId];
  }
}
