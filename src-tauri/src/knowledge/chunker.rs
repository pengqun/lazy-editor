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
