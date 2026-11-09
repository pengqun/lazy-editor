use anyhow::Result;
use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use std::path::Path;

pub struct Embedder {
    model: TextEmbedding,
}

impl Embedder {
    /// Initialize using fastembed's default cache location (cwd-relative; avoid in production).
    pub fn new() -> Result<Self> {
        Self::new_with_cache_dir(Path::new(".fastembed_cache"))
    }

    /// Initialize with an explicit, writable model cache directory (Hugging Face downloads land here).
    pub fn new_with_cache_dir(cache_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(cache_dir).map_err(|e| {
            anyhow::anyhow!(
                "Cannot create embedding model cache at {}: {}",
                cache_dir.display(),
                e
            )
        })?;

        log::info!(
            "Initializing embedding model (AllMiniLML6V2), cache: {}",
            cache_dir.display()
        );

        let model = TextEmbedding::try_new(
            InitOptions::new(EmbeddingModel::AllMiniLML6V2)
                .with_cache_dir(cache_dir.to_path_buf())
                .with_show_download_progress(true),
        )?;

        log::info!("Embedding model ready");
        Ok(Embedder { model })
    }

    /// Initialize the embedder, returning a user-facing error string on failure.
    pub fn initialize() -> Result<Self, String> {
        Self::new().map_err(|e| e.to_string())
    }

    /// Initialize with an explicit cache directory (production / diagnostics retry).
    pub fn initialize_with_cache(cache_dir: &Path) -> Result<Self, String> {
        Self::new_with_cache_dir(cache_dir).map_err(|e| enrich_init_error(&e.to_string(), cache_dir))
    }
}

fn enrich_init_error(base: &str, cache_dir: &Path) -> String {
    let lower = base.to_lowercase();
    if lower.contains("retrieve")
        || lower.contains("model.onnx")
        || lower.contains("onnx/")
    {
        format!(
            "{} — model cache: {}",
            base.trim(),
            cache_dir.display()
        )
    } else {
        base.to_string()
    }
}

impl Embedder {
    /// Embed a single text string. Returns a 384-dimensional vector.
    pub fn embed_text(&self, text: &str) -> Result<Vec<f32>> {
        let embeddings = self.model.embed(vec![text.to_string()], None)?;
        embeddings
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("Embedding model returned no results"))
    }

    /// Embed a batch of text strings. More efficient than calling embed_text in a loop.
    pub fn embed_batch(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let embeddings = self.model.embed(texts.to_vec(), None)?;
        Ok(embeddings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn enrich_init_error_appends_cache_path_for_model_retrieval_failures() {
        let cache = PathBuf::from("/tmp/lazy-editor-test-cache");
        let msg = enrich_init_error("Failed to retrieve model.onnx", &cache);
        assert!(msg.contains("Failed to retrieve model.onnx"));
        assert!(msg.contains("/tmp/lazy-editor-test-cache"));
    }

    #[test]
    fn enrich_init_error_leaves_unrelated_errors_unchanged() {
        let cache = PathBuf::from("/tmp/cache");
        let msg = enrich_init_error("permission denied", &cache);
        assert_eq!(msg, "permission denied");
    }
}
