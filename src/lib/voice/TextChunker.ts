/**
 * Text Chunker for Streaming LLM to TTS
 * Buffers incoming token streams and emits natural speech chunks at clause/sentence boundaries.
 * Prevents single-word fragmentation while ensuring ultra-low first-phrase latency.
 */

export interface TextChunk {
  id: string;
  text: string;
  isFinal: boolean;
  sequenceIndex: number;
}

export class TextChunker {
  private buffer = '';
  private sequenceCounter = 0;
  private isFirstChunk = true;

  // Primary sentence terminators
  private sentenceRegex = /([.?!।\n]+)(?:\s+|$)/;
  // Natural clause break terminators for first-phrase low latency
  private clauseRegex = /([,;:—]+)(?:\s+|$)/;

  /**
   * Appends incoming LLM token/delta and returns any completed natural speech chunks
   */
  public push(delta: string): TextChunk[] {
    this.buffer += delta;
    const chunks: TextChunk[] = [];

    // Continuous boundary scanning
    while (this.buffer.length > 0) {
      // For the first chunk, allow clause breaks (, or :) if buffer length >= 12 characters
      if (this.isFirstChunk && this.buffer.length >= 12) {
        const clauseMatch = this.buffer.match(this.clauseRegex);
        if (clauseMatch && clauseMatch.index !== undefined) {
          const cutIndex = clauseMatch.index + clauseMatch[1].length;
          const text = this.buffer.slice(0, cutIndex).trim();
          this.buffer = this.buffer.slice(cutIndex).trimStart();
          if (text.length > 0) {
            this.isFirstChunk = false;
            chunks.push({
              id: `chunk_${Date.now()}_${++this.sequenceCounter}`,
              text: this.cleanChunkForSpeech(text),
              isFinal: false,
              sequenceIndex: this.sequenceCounter,
            });
            continue;
          }
        }
      }

      // Sentence boundary scan
      const sentenceMatch = this.buffer.match(this.sentenceRegex);
      if (sentenceMatch && sentenceMatch.index !== undefined) {
        const cutIndex = sentenceMatch.index + sentenceMatch[1].length;
        const text = this.buffer.slice(0, cutIndex).trim();
        this.buffer = this.buffer.slice(cutIndex).trimStart();
        if (text.length > 0) {
          this.isFirstChunk = false;
          chunks.push({
            id: `chunk_${Date.now()}_${++this.sequenceCounter}`,
            text: this.cleanChunkForSpeech(text),
            isFinal: false,
            sequenceIndex: this.sequenceCounter,
          });
          continue;
        }
      }

      // If buffer has grown very long without punctuation (over 120 chars), break cleanly at the last space
      if (this.buffer.length > 120) {
        const lastSpace = this.buffer.lastIndexOf(' ');
        if (lastSpace > 40) {
          const text = this.buffer.slice(0, lastSpace).trim();
          this.buffer = this.buffer.slice(lastSpace).trimStart();
          if (text.length > 0) {
            this.isFirstChunk = false;
            chunks.push({
              id: `chunk_${Date.now()}_${++this.sequenceCounter}`,
              text: this.cleanChunkForSpeech(text),
              isFinal: false,
              sequenceIndex: this.sequenceCounter,
            });
            continue;
          }
        }
      }

      break;
    }

    return chunks;
  }

  /**
   * Flushes any remaining text in the buffer as the final chunk
   */
  public flush(): TextChunk[] {
    const chunks: TextChunk[] = [];
    const remaining = this.buffer.trim();
    this.buffer = '';
    this.isFirstChunk = true;

    if (remaining.length > 0) {
      chunks.push({
        id: `chunk_${Date.now()}_${++this.sequenceCounter}`,
        text: this.cleanChunkForSpeech(remaining),
        isFinal: true,
        sequenceIndex: this.sequenceCounter,
      });
    }
    return chunks;
  }

  /**
   * Clears internal state on barge-in / cancellation
   */
  public reset(): void {
    this.buffer = '';
    this.sequenceCounter = 0;
    this.isFirstChunk = true;
  }

  private cleanChunkForSpeech(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, 'Code block generated.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*#_~>{}[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
