/**
 * Text Chunking Utility
 * ============================================================================
 * Splits text into chunks for TTS processing.
 * 
 * Rules:
 * - Minimum 200 characters per chunk
 * - Cuts at nearest sentence boundary (., !, ?) after reaching minimum
 * - Handles edge cases like short texts and texts without sentence boundaries
 */

export interface TextChunk {
  index: number;
  text: string;
  charCount: number;
  startIndex: number;
  endIndex: number;
}

const MIN_CHUNK_SIZE = 200;
const SENTENCE_ENDINGS = /[.!?]/;

/**
 * Split text into chunks suitable for TTS processing.
 * 
 * @param text - The full text to split
 * @param minChunkSize - Minimum characters per chunk (default: 200)
 * @returns Array of text chunks with metadata
 */
export function splitTextIntoChunks(
  text: string,
  minChunkSize: number = MIN_CHUNK_SIZE
): TextChunk[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const trimmedText = text.trim();
  
  // If text is shorter than min size, return as single chunk
  if (trimmedText.length <= minChunkSize) {
    return [{
      index: 0,
      text: trimmedText,
      charCount: trimmedText.length,
      startIndex: 0,
      endIndex: trimmedText.length,
    }];
  }

  const chunks: TextChunk[] = [];
  let currentPos = 0;
  let chunkIndex = 0;

  while (currentPos < trimmedText.length) {
    // Calculate the minimum end position
    const minEndPos = Math.min(currentPos + minChunkSize, trimmedText.length);
    
    // If we're at the end of the text, take the rest
    if (minEndPos >= trimmedText.length) {
      const chunkText = trimmedText.slice(currentPos).trim();
      if (chunkText.length > 0) {
        chunks.push({
          index: chunkIndex,
          text: chunkText,
          charCount: chunkText.length,
          startIndex: currentPos,
          endIndex: trimmedText.length,
        });
      }
      break;
    }

    // Find the next sentence boundary after minEndPos
    let sentenceEnd = -1;
    for (let i = minEndPos; i < trimmedText.length; i++) {
      if (SENTENCE_ENDINGS.test(trimmedText[i])) {
        // Include one character after the sentence ending if it's a space
        sentenceEnd = i + 1;
        if (i + 1 < trimmedText.length && trimmedText[i + 1] === ' ') {
          sentenceEnd = i + 2;
        }
        break;
      }
    }

    // If no sentence boundary found, look for other natural break points
    if (sentenceEnd === -1) {
      // Look for paragraph break (double newline)
      const paragraphBreak = trimmedText.indexOf('\n\n', minEndPos);
      if (paragraphBreak !== -1 && paragraphBreak < currentPos + minChunkSize * 3) {
        sentenceEnd = paragraphBreak + 2;
      } else {
        // Look for single newline
        const newlineBreak = trimmedText.indexOf('\n', minEndPos);
        if (newlineBreak !== -1 && newlineBreak < currentPos + minChunkSize * 3) {
          sentenceEnd = newlineBreak + 1;
        } else {
          // If no natural break found, just take up to a reasonable limit
          sentenceEnd = Math.min(currentPos + minChunkSize * 2, trimmedText.length);
        }
      }
    }

    // Extract the chunk
    const chunkText = trimmedText.slice(currentPos, sentenceEnd).trim();
    if (chunkText.length > 0) {
      chunks.push({
        index: chunkIndex,
        text: chunkText,
        charCount: chunkText.length,
        startIndex: currentPos,
        endIndex: sentenceEnd,
      });
      chunkIndex++;
    }

    currentPos = sentenceEnd;
  }

  return chunks;
}

/**
 * Calculate estimated audio duration based on text length.
 * Assumes average speaking rate of ~150 words per minute.
 * 
 * @param text - Text to estimate duration for
 * @returns Estimated duration in seconds
 */
export function estimateAudioDuration(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  const wordsPerMinute = 150;
  return Math.ceil((words / wordsPerMinute) * 60);
}

/**
 * Get total chunk statistics.
 */
export function getChunkStats(chunks: TextChunk[]): {
  totalChunks: number;
  totalCharacters: number;
  averageChunkSize: number;
  estimatedTotalDuration: number;
} {
  const totalCharacters = chunks.reduce((sum, c) => sum + c.charCount, 0);
  const totalText = chunks.map(c => c.text).join(' ');
  
  return {
    totalChunks: chunks.length,
    totalCharacters,
    averageChunkSize: chunks.length > 0 ? Math.round(totalCharacters / chunks.length) : 0,
    estimatedTotalDuration: estimateAudioDuration(totalText),
  };
}
