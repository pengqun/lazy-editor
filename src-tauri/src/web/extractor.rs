use std::collections::HashSet;

use anyhow::Result;
use scraper::{Html, Node, Selector};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ArticleContent {
    pub title: String,
    pub text: String,
    pub url: String,
}

/// Fetch a URL and extract its readable content.
pub async fn fetch_and_extract(url: &str) -> Result<ArticleContent> {
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .header("User-Agent", "LazyEditor/0.1")
        .send()
        .await?;

    let html = resp.text().await?;
    let title = extract_title(&html).unwrap_or_else(|| url.to_string());
    let text = extract_text_with_fallback(&html);

    Ok(ArticleContent {
        title,
        text,
        url: url.to_string(),
    })
}

fn extract_text_with_fallback(html: &str) -> String {
    extract_readable_text(html).unwrap_or_else(|| strip_html_tags(html))
}

/// CSS selector matching common noise containers to strip from content.
const NOISE_SELECTOR_STR: &str = "nav, footer, aside, \
    [role='navigation'], [role='contentinfo'], \
    [class*='comment'], [id*='comment'], \
    [class*='advert'], [id*='advert'], \
    [class*='cookie'], [id*='cookie'], \
    [class*='newsletter'], [id*='newsletter'], \
    [class*='popup'], [id*='popup']";

/// Collect text from an element, skipping subtrees that match noise selectors.
fn collect_clean_text(el: &scraper::ElementRef, noise_sel: &Selector) -> String {
    let noise_ids: HashSet<ego_tree::NodeId> = el.select(noise_sel).map(|n| n.id()).collect();
    if noise_ids.is_empty() {
        return normalize_text(&el.text().collect::<Vec<_>>().join(" "));
    }

    let mut parts: Vec<&str> = Vec::new();
    let mut skip_depth: u32 = 0;

    for edge in el.traverse() {
        match edge {
            ego_tree::iter::Edge::Open(node) => {
                if skip_depth > 0 {
                    skip_depth += 1;
                    continue;
                }
                if noise_ids.contains(&node.id()) {
                    skip_depth = 1;
                    continue;
                }
                if let Node::Text(ref text) = *node.value() {
                    parts.push(&text);
                }
            }
            ego_tree::iter::Edge::Close(_) => {
                if skip_depth > 0 {
                    skip_depth -= 1;
                }
            }
        }
    }

    normalize_text(&parts.join(" "))
}

fn extract_readable_text(html: &str) -> Option<String> {
    let document = Html::parse_document(html);
    let noise_sel = Selector::parse(NOISE_SELECTOR_STR).ok()?;

    // 优先使用语义化容器。
    let semantic_candidates = ["article", "main", "[role='main']"];
    let mut best_semantic = String::new();
    for selector_str in semantic_candidates {
        let selector = Selector::parse(selector_str).ok()?;
        for el in document.select(&selector) {
            let text = collect_clean_text(&el, &noise_sel);
            if text.len() > best_semantic.len() {
                best_semantic = text;
            }
        }
    }
    if best_semantic.len() >= 120 {
        return Some(best_semantic);
    }

    // 回退到轻量启发式：在常见内容容器中打分选最优块。
    let candidate_selector = Selector::parse("article, main, section, div").ok()?;
    let link_selector = Selector::parse("a").ok()?;

    let mut best_score = f64::MIN;
    let mut best_text = String::new();

    for el in document.select(&candidate_selector) {
        let text = collect_clean_text(&el, &noise_sel);
        if text.len() < 120 {
            continue;
        }

        let link_text_len: usize = el
            .select(&link_selector)
            .map(|a| normalize_text(a.text().collect::<Vec<_>>().join(" ").as_str()).len())
            .sum();
        let link_ratio = (link_text_len as f64) / (text.len() as f64);
        if link_ratio > 0.6 {
            continue;
        }

        let mut score = (text.len() as f64) * (1.0 - link_ratio);
        let attrs = format!(
            "{} {}",
            el.value().attr("id").unwrap_or_default().to_lowercase(),
            el.value().attr("class").unwrap_or_default().to_lowercase()
        );

        if contains_any(&attrs, &["content", "article", "post", "entry", "body", "main"]) {
            score += 80.0;
        }
        if contains_any(
            &attrs,
            &[
                "nav",
                "footer",
                "header",
                "menu",
                "sidebar",
                "comment",
                "ads",
                "advert",
            ],
        ) {
            score -= 120.0;
        }

        if score > best_score {
            best_score = score;
            best_text = text;
        }
    }

    if best_text.len() >= 120 {
        return Some(best_text);
    }

    // 最后尝试 body 文本（也过滤噪音）。
    let body_selector = Selector::parse("body").ok()?;
    let body_text = document
        .select(&body_selector)
        .next()
        .map(|b| collect_clean_text(&b, &noise_sel))
        .filter(|text| text.len() >= 120);

    body_text
}

fn contains_any(haystack: &str, patterns: &[&str]) -> bool {
    patterns.iter().any(|p| haystack.contains(p))
}

fn normalize_text(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;

    for c in html.chars() {
        if c == '<' {
            in_tag = true;
            continue;
        }
        if c == '>' {
            in_tag = false;
            result.push(' ');
            continue;
        }
        if !in_tag {
            result.push(c);
        }
    }

    normalize_text(&result)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_main_article_content() {
        let html = r#"
        <html>
          <head><title>Demo Article</title></head>
          <body>
            <article class="post-content">
              <h1>Rust Readability</h1>
              <p>Rust makes systems programming approachable and reliable for teams.</p>
              <p>This paragraph has enough words to represent a realistic article body that should be selected as the main readable content in extraction tests.</p>
              <p>The extractor should keep this core text instead of random page fragments.</p>
            </article>
          </body>
        </html>
        "#;

        let text = extract_text_with_fallback(html);
        assert!(text.contains("Rust makes systems programming approachable"));
        assert!(text.contains("main readable content"));
    }

    #[test]
    fn ignores_navigation_and_footer_noise() {
        let html = r#"
        <html>
          <body>
            <nav class="menu">Home Products Docs Pricing About Contact</nav>
            <div id="content" class="article-body">
              <p>Lazy Editor focuses on writing flow and structured drafting support for long-form content.</p>
              <p>The body includes meaningful context and complete sentences so extractor heuristics can rank it above noisy navigation blocks.</p>
              <p>Users can then work with cleaner source text during downstream processing.</p>
            </div>
            <footer>Copyright 2026 Example Corp. Terms Privacy Careers</footer>
          </body>
        </html>
        "#;

        let text = extract_text_with_fallback(html);
        assert!(text.contains("Lazy Editor focuses on writing flow"));
        assert!(!text.contains("Home Products Docs Pricing"));
        assert!(!text.contains("Copyright 2026"));
    }

    #[test]
    fn falls_back_when_readability_fails() {
        let html = "<html><head><title>x</title></head><body><span>tiny</span></body></html>";

        let text = extract_text_with_fallback(html);
        assert_eq!(text, "x tiny");
    }

    #[test]
    fn filters_nested_noise_from_article() {
        let html = r#"
        <html><body>
            <article>
              <p>Main article content that is long enough to pass the minimum threshold for extraction and should be preserved in full by the extractor.</p>
              <nav class="breadcrumb">Home > Blog > This Post</nav>
              <p>More article text continues here with important information.</p>
              <footer class="article-footer">Share on Twitter | Facebook | LinkedIn</footer>
              <aside class="sidebar">Related: Other articles you might like</aside>
              <div class="comments">User1: Great post! User2: Thanks for sharing!</div>
            </article>
        </body></html>
        "#;

        let text = extract_text_with_fallback(html);
        assert!(text.contains("Main article content"), "should keep main content");
        assert!(text.contains("More article text"), "should keep body paragraphs");
        assert!(!text.contains("Home > Blog"), "should filter nav breadcrumbs");
        assert!(!text.contains("Share on Twitter"), "should filter article footer");
        assert!(!text.contains("Related: Other articles"), "should filter aside");
        assert!(!text.contains("Great post"), "should filter comments");
    }

    #[test]
    fn filters_advert_and_newsletter_noise() {
        let html = r#"
        <html><body>
            <main>
              <p>This is the primary content of the page with enough text to be selected as the main readable content block by the extraction heuristics.</p>
              <div class="advertisement-banner">Buy our product now! Special offer!</div>
              <div id="newsletter-signup">Subscribe to our newsletter for updates!</div>
              <div class="popup-overlay">Sign up for free trial!</div>
              <p>The article continues with more substantive content here.</p>
            </main>
        </body></html>
        "#;

        let text = extract_text_with_fallback(html);
        assert!(text.contains("primary content"), "should keep main content");
        assert!(text.contains("article continues"), "should keep body text");
        assert!(!text.contains("Buy our product"), "should filter adverts");
        assert!(!text.contains("Subscribe to our newsletter"), "should filter newsletter");
        assert!(!text.contains("Sign up for free trial"), "should filter popups");
    }

    #[test]
    fn preserves_content_when_no_noise_present() {
        let html = r#"
        <html><body>
            <article>
              <h1>Clean Article</h1>
              <p>This article has no noise elements at all. It contains only meaningful content that should be fully preserved by the extractor without any loss.</p>
              <p>Second paragraph with additional important information for the reader.</p>
            </article>
        </body></html>
        "#;

        let text = extract_text_with_fallback(html);
        assert!(text.contains("Clean Article"));
        assert!(text.contains("no noise elements"));
        assert!(text.contains("Second paragraph"));
    }

    #[test]
    fn body_fallback_also_filters_noise() {
        // No semantic containers — falls through to body extraction
        let html = r#"
        <html><body>
            <p>A long enough body text that should pass the minimum threshold for the body fallback path in the extractor. This paragraph provides enough content.</p>
            <nav>Home About Contact Blog Pricing Documentation Support Login Register</nav>
            <footer>Copyright 2026 Example Corp. All rights reserved. Terms Privacy</footer>
        </body></html>
        "#;

        let text = extract_text_with_fallback(html);
        assert!(text.contains("long enough body text"), "should keep body content");
        assert!(!text.contains("Home About Contact"), "should filter nav in body fallback");
        assert!(!text.contains("Copyright 2026"), "should filter footer in body fallback");
    }

    #[test]
    fn collect_clean_text_handles_deeply_nested_noise() {
        let html = r#"
        <html><body>
            <article>
              <p>Top level content that provides the main substance of this article with enough words for threshold.</p>
              <div class="comment-section">
                <div class="comment">
                  <p>Nested comment text that should be removed</p>
                  <div class="reply">Even deeper nested reply</div>
                </div>
              </div>
              <p>Content after the comments section resumes here.</p>
            </article>
        </body></html>
        "#;

        let text = extract_text_with_fallback(html);
        assert!(text.contains("Top level content"));
        assert!(text.contains("Content after the comments"));
        assert!(!text.contains("Nested comment text"));
        assert!(!text.contains("Even deeper nested reply"));
    }
}
