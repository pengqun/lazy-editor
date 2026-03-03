use anyhow::Result;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ArticleContent {
    pub title: String,
    pub text: String,
    pub url: String,
}

/// Fetch a URL and extract its readable content.
/// Phase 5 implementation — currently a placeholder.
pub async fn fetch_and_extract(url: &str) -> Result<ArticleContent> {
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .header("User-Agent", "LazyEditor/0.1")
        .send()
        .await?;

    let html = resp.text().await?;

    // Basic extraction: strip HTML tags for now
    // TODO: Replace with proper readability extraction in Phase 5
    let text = strip_html_tags(&html);
    let title = extract_title(&html).unwrap_or_else(|| url.to_string());

    Ok(ArticleContent {
        title,
        text,
        url: url.to_string(),
    })
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    let in_script = false;
    let in_style = false;

    for c in html.chars() {
        if c == '<' {
            in_tag = true;
            continue;
        }
        if c == '>' {
            in_tag = false;
            continue;
        }
        if in_tag {
            // Check for script/style tags
            continue;
        }
        if !in_script && !in_style {
            result.push(c);
        }
    }

    // Clean up excessive whitespace
    let _ = in_script;
    let _ = in_style;
    result
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title>")?;
    let end = lower.find("</title>")?;
    if start < end {
        Some(html[start + 7..end].trim().to_string())
    } else {
        None
    }
}
