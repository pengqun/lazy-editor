use anyhow::Result;
use scraper::{Html, Selector};
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

fn extract_readable_text(html: &str) -> Option<String> {
    let document = Html::parse_document(html);

    // 优先使用语义化容器。
    let semantic_candidates = ["article", "main", "[role='main']"];
    let mut best_semantic = String::new();
    for selector_str in semantic_candidates {
        let selector = Selector::parse(selector_str).ok()?;
        for el in document.select(&selector) {
            let text = normalize_text(el.text().collect::<Vec<_>>().join(" ").as_str());
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
        let text = normalize_text(el.text().collect::<Vec<_>>().join(" ").as_str());
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

    // 最后尝试 body 文本。
    let body_selector = Selector::parse("body").ok()?;
    let body_text = document
        .select(&body_selector)
        .next()
        .map(|b| normalize_text(b.text().collect::<Vec<_>>().join(" ").as_str()))
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
}
