use crate::knowledge::db::SearchResult;

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
            prompt.push_str(&format!(
                "<context source=\"{}\" relevance=\"{:.0}%\">\n{}\n</context>\n\n",
                result.document_title,
                result.score * 100.0,
                result.chunk_content,
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
