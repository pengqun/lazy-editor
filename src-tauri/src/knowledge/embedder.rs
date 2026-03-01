use anyhow::Result;
use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};

pub struct Embedder {
    model: TextEmbedding,
}

impl Embedder {
    pub fn new() -> Result<Self> {
        log::info!("Initializing embedding model (AllMiniLML6V2)...");

        let model = TextEmbedding::try_new(
            InitOptions::new(EmbeddingModel::AllMiniLML6V2).with_show_download_progress(true),
        )?;

        log::info!("Embedding model ready");
        Ok(Embedder { model })
    }

    /// Embed a single text string. Returns a 384-dimensional vector.
    pub fn embed_text(&self, text: &str) -> Result<Vec<f32>> {
        let embeddings = self.model.embed(vec![text.to_string()], None)?;
        Ok(embeddings.into_iter().next().unwrap())
    }

    /// Embed a batch of text strings. More efficient than calling embed_text in a loop.
    pub fn embed_batch(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let embeddings = self.model.embed(texts.to_vec(), None)?;
        Ok(embeddings)
    }
}
