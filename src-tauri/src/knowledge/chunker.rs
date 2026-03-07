/// Chunk text into overlapping segments suitable for embedding.
///
/// Strategy:
/// - Target ~512 tokens per chunk (~2048 chars as rough approximation)
/// - 64-token overlap (~256 chars)
/// - Respect paragraph boundaries: never split mid-paragraph
/// - Preserve heading context as prefix
pub struct ChunkOptions {
    pub max_chars: usize,
    pub overlap_chars: usize,
}

impl Default for ChunkOptions {
    fn default() -> Self {
        ChunkOptions {
            max_chars: 2048,
            overlap_chars: 256,
        }
    }
}

pub struct TextChunk {
    pub content: String,
    pub index: usize,
    pub approx_tokens: usize,
}

pub fn chunk_text(text: &str, options: &ChunkOptions) -> Vec<TextChunk> {
    let paragraphs: Vec<&str> = text.split("\n\n").collect();

    if paragraphs.is_empty() {
        return vec![];
    }

    let mut chunks = Vec::new();
    let mut current_chunk = String::new();
    let mut current_heading = String::new();

    for para in &paragraphs {
        let para = para.trim();
        if para.is_empty() {
            continue;
        }

        // Track headings for context
        if para.starts_with('#') {
            current_heading = para.to_string();
        }

        // If adding this paragraph would exceed max, finalize current chunk
        if !current_chunk.is_empty()
            && current_chunk.len() + para.len() + 2 > options.max_chars
        {
            let chunk_index = chunks.len();
            let approx_tokens = current_chunk.len() / 4; // rough approximation
            chunks.push(TextChunk {
                content: current_chunk.clone(),
                index: chunk_index,
                approx_tokens,
            });

            // Start new chunk with overlap: include heading context + tail of previous
            current_chunk = String::new();
            if !current_heading.is_empty() && !para.starts_with('#') {
                current_chunk.push_str(&current_heading);
                current_chunk.push_str("\n\n");
            }

            // Add overlap from previous chunk
            let prev_content = &chunks.last().unwrap().content;
            if prev_content.len() > options.overlap_chars {
                let overlap_start = prev_content.len() - options.overlap_chars;
                // Find a clean break point (paragraph or sentence)
                if let Some(pos) = prev_content[overlap_start..].find("\n\n") {
                    let overlap = &prev_content[overlap_start + pos + 2..];
                    if !overlap.is_empty() {
                        current_chunk.push_str(overlap);
                        current_chunk.push_str("\n\n");
                    }
                }
            }
        }

        if !current_chunk.is_empty() {
            current_chunk.push_str("\n\n");
        }
        current_chunk.push_str(para);
    }

    // Don't forget the last chunk
    if !current_chunk.is_empty() {
        let chunk_index = chunks.len();
        let approx_tokens = current_chunk.len() / 4;
        chunks.push(TextChunk {
            content: current_chunk,
            index: chunk_index,
            approx_tokens,
        });
    }

    chunks
}

pub fn chunk_markdown(text: &str) -> Vec<TextChunk> {
    chunk_text(text, &ChunkOptions::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_returns_no_chunks() {
        let chunks = chunk_text("", &ChunkOptions::default());
        assert!(chunks.is_empty());
    }

    #[test]
    fn whitespace_only_returns_no_chunks() {
        let chunks = chunk_text("   \n\n   \n\n   ", &ChunkOptions::default());
        assert!(chunks.is_empty());
    }

    #[test]
    fn single_paragraph_returns_one_chunk() {
        let chunks = chunk_text("Hello world", &ChunkOptions::default());
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].content, "Hello world");
        assert_eq!(chunks[0].index, 0);
    }

    #[test]
    fn multiple_paragraphs_within_limit_stay_in_one_chunk() {
        let text = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
        let chunks = chunk_text(text, &ChunkOptions::default());
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].content.contains("Paragraph one."));
        assert!(chunks[0].content.contains("Paragraph three."));
    }

    #[test]
    fn text_exceeding_max_chars_splits_into_chunks() {
        let opts = ChunkOptions {
            max_chars: 50,
            overlap_chars: 0,
        };
        let text = "This is paragraph number one.\n\nThis is paragraph number two.\n\nThis is paragraph number three.";
        let chunks = chunk_text(text, &opts);
        assert!(
            chunks.len() >= 2,
            "Expected at least 2 chunks, got {}",
            chunks.len()
        );
        for chunk in &chunks {
            assert!(!chunk.content.is_empty());
        }
    }

    #[test]
    fn chunk_indices_are_sequential() {
        let opts = ChunkOptions {
            max_chars: 30,
            overlap_chars: 0,
        };
        let text = "Short para A.\n\nShort para B.\n\nShort para C.";
        let chunks = chunk_text(text, &opts);
        for (i, chunk) in chunks.iter().enumerate() {
            assert_eq!(chunk.index, i);
        }
    }

    #[test]
    fn approx_tokens_is_quarter_of_chars() {
        let chunks = chunk_text("Hello world! This is a test.", &ChunkOptions::default());
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].approx_tokens, chunks[0].content.len() / 4);
    }

    #[test]
    fn heading_context_preserved_in_subsequent_chunks() {
        let opts = ChunkOptions {
            max_chars: 60,
            overlap_chars: 0,
        };
        let text =
            "# My Heading\n\nFirst paragraph under heading.\n\nSecond paragraph forces new chunk.";
        let chunks = chunk_text(text, &opts);
        if chunks.len() >= 2 {
            assert!(
                chunks[1].content.starts_with("# My Heading"),
                "Expected heading context in chunk 1, got: {}",
                chunks[1].content
            );
        }
    }

    #[test]
    fn chunk_markdown_uses_default_options() {
        let text = "Simple text for default chunking.";
        let chunks = chunk_markdown(text);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].content, text);
    }

    #[test]
    fn custom_small_max_chars() {
        let opts = ChunkOptions {
            max_chars: 20,
            overlap_chars: 5,
        };
        let text = "AAAA AAAA AAAA\n\nBBBB BBBB BBBB\n\nCCCC CCCC CCCC";
        let chunks = chunk_text(text, &opts);
        assert!(chunks.len() >= 2);
    }
}
