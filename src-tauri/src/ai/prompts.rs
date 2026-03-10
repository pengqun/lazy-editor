use crate::knowledge::db::SearchResult;

/// Escape XML-reserved characters in chunk content to prevent prompt injection.
fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Build the system prompt for AI actions, incorporating KB context.
pub fn build_system_prompt(action: &str, kb_results: &[SearchResult]) -> String {
    let mut prompt = String::new();

    prompt.push_str(
        "You are an AI writing assistant embedded in Lazy Editor, \
         an AI-native writing workspace. You help users write, research, \
         and edit long-form content like blog posts, essays, and reports.\n\n",
    );

    // Inject knowledge base context
    if !kb_results.is_empty() {
        prompt.push_str("## Reference Material from Knowledge Base\n\n");
        prompt.push_str(
            "Use the following context from the user's knowledge base to inform your response. \
             Cite or draw upon this information naturally:\n\n",
        );
        for (i, result) in kb_results.iter().enumerate() {
            let escaped_title = xml_escape(&result.document_title);
            let escaped_content = xml_escape(&result.chunk_content);
            prompt.push_str(&format!(
                "<context source=\"{}\" relevance=\"{:.0}%\">\n{}\n</context>\n\n",
                escaped_title,
                result.score * 100.0,
                escaped_content,
            ));
            if i >= 4 {
                break; // Max 5 context blocks
            }
        }
    }

    // Action-specific instructions
    match action {
        "draft" => {
            prompt.push_str(
                "## Task: Draft\n\n\
                 Write a well-structured draft based on the user's topic. \
                 Use the reference material above when relevant. \
                 Output clean Markdown with appropriate headings, paragraphs, and formatting. \
                 Write in a clear, engaging style suitable for a blog post or article.",
            );
        }
        "expand" => {
            prompt.push_str(
                "## Task: Expand\n\n\
                 Expand the user's text with more detail, examples, and depth. \
                 Draw on the reference material when relevant. \
                 Maintain the same tone and style as the original text. \
                 Output the expanded text only — no meta-commentary.",
            );
        }
        "rewrite" => {
            prompt.push_str(
                "## Task: Rewrite\n\n\
                 Rewrite the user's text according to their instructions. \
                 Maintain the core meaning while applying the requested changes. \
                 Output the rewritten text only — no meta-commentary.",
            );
        }
        "research" => {
            prompt.push_str(
                "## Task: Research Synthesis\n\n\
                 Synthesize the reference material into a clear, informative summary \
                 that answers the user's research query. \
                 Organize findings with headings and bullet points where appropriate. \
                 Cite which sources provided which information.",
            );
        }
        "summarize" => {
            prompt.push_str(
                "## Task: Summarize\n\n\
                 Provide a concise summary of the given text. \
                 Capture the key points and main arguments. \
                 Keep the summary to roughly 1/3 of the original length.",
            );
        }
        _ => {
            prompt.push_str(
                "## Task: General Writing Assistance\n\n\
                 Help the user with their writing request. \
                 Use the reference material when relevant. \
                 Output clean, well-formatted Markdown.",
            );
        }
    }

    prompt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xml_escape_handles_special_chars() {
        assert_eq!(xml_escape("a < b & c > d"), "a &lt; b &amp; c &gt; d");
    }

    #[test]
    fn xml_escape_no_change_for_clean_text() {
        assert_eq!(xml_escape("hello world"), "hello world");
    }

    #[test]
    fn build_system_prompt_includes_kb_context() {
        let results = vec![SearchResult {
            chunk_content: "Test <content> & more".to_string(),
            document_title: "Doc <1>".to_string(),
            document_id: 1,
            chunk_id: 1,
            chunk_index: 0,
            score: 0.85,
        }];
        let prompt = build_system_prompt("draft", &results);
        // Verify XML escaping in context blocks
        assert!(prompt.contains("Doc &lt;1&gt;"));
        assert!(prompt.contains("Test &lt;content&gt; &amp; more"));
        assert!(prompt.contains("relevance=\"85%\""));
    }

    #[test]
    fn build_system_prompt_limits_context_blocks() {
        let results: Vec<SearchResult> = (0..10)
            .map(|i| SearchResult {
                chunk_content: format!("chunk {}", i),
                document_title: format!("Doc {}", i),
                document_id: i,
                chunk_id: i,
                chunk_index: 0,
                score: 0.9 - i as f64 * 0.05,
            })
            .collect();
        let prompt = build_system_prompt("research", &results);
        let context_count = prompt.matches("<context ").count();
        assert!(context_count <= 5, "Expected max 5 context blocks, got {}", context_count);
    }

    #[test]
    fn build_system_prompt_no_kb_context() {
        let prompt = build_system_prompt("summarize", &[]);
        assert!(!prompt.contains("<context"));
        assert!(prompt.contains("Summarize"));
    }
}
