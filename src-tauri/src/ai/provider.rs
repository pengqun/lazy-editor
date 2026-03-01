use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct GenerateRequest {
    pub system: String,
    pub messages: Vec<Message>,
    pub max_tokens: u32,
    pub temperature: f32,
}

/// Unified trait for all AI providers.
#[async_trait]
pub trait AiProvider: Send + Sync {
    fn name(&self) -> &str;

    /// Generate a complete response (non-streaming).
    async fn generate(&self, request: GenerateRequest) -> Result<String>;

    /// Generate a streaming response, sending chunks through the channel.
    async fn generate_stream(
        &self,
        request: GenerateRequest,
        tx: mpsc::Sender<String>,
    ) -> Result<()>;
}

// ── Claude Provider ──────────────────────────────────────────────────

pub struct ClaudeProvider {
    api_key: String,
    model: String,
    client: reqwest::Client,
}

impl ClaudeProvider {
    pub fn new(api_key: String, model: String) -> Self {
        ClaudeProvider {
            api_key,
            model,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for ClaudeProvider {
    fn name(&self) -> &str {
        "claude"
    }

    async fn generate(&self, request: GenerateRequest) -> Result<String> {
        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "system": request.system,
            "messages": request.messages.iter().map(|m| {
                serde_json::json!({
                    "role": m.role,
                    "content": m.content,
                })
            }).collect::<Vec<_>>(),
        });

        let resp = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        let json: serde_json::Value = resp.json().await?;

        let text = json["content"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|block| block["text"].as_str())
            .unwrap_or("")
            .to_string();

        Ok(text)
    }

    async fn generate_stream(
        &self,
        request: GenerateRequest,
        tx: mpsc::Sender<String>,
    ) -> Result<()> {
        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "stream": true,
            "system": request.system,
            "messages": request.messages.iter().map(|m| {
                serde_json::json!({
                    "role": m.role,
                    "content": m.content,
                })
            }).collect::<Vec<_>>(),
        });

        let resp = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        let mut stream = resp.bytes_stream();
        let mut buffer = String::new();

        use futures::StreamExt;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Parse SSE events from buffer
            while let Some(pos) = buffer.find("\n\n") {
                let event_str = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                for line in event_str.lines() {
                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" {
                            return Ok(());
                        }
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            if json["type"] == "content_block_delta" {
                                if let Some(text) = json["delta"]["text"].as_str() {
                                    let _ = tx.send(text.to_string()).await;
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

// ── OpenAI Provider ──────────────────────────────────────────────────

pub struct OpenAiProvider {
    api_key: String,
    model: String,
    client: reqwest::Client,
}

impl OpenAiProvider {
    pub fn new(api_key: String, model: String) -> Self {
        OpenAiProvider {
            api_key,
            model,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for OpenAiProvider {
    fn name(&self) -> &str {
        "openai"
    }

    async fn generate(&self, request: GenerateRequest) -> Result<String> {
        let mut messages = vec![serde_json::json!({
            "role": "system",
            "content": request.system,
        })];
        for m in &request.messages {
            messages.push(serde_json::json!({
                "role": m.role,
                "content": m.content,
            }));
        }

        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "messages": messages,
        });

        let resp = self
            .client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        let json: serde_json::Value = resp.json().await?;

        let text = json["choices"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|choice| choice["message"]["content"].as_str())
            .unwrap_or("")
            .to_string();

        Ok(text)
    }

    async fn generate_stream(
        &self,
        request: GenerateRequest,
        tx: mpsc::Sender<String>,
    ) -> Result<()> {
        let mut messages = vec![serde_json::json!({
            "role": "system",
            "content": request.system,
        })];
        for m in &request.messages {
            messages.push(serde_json::json!({
                "role": m.role,
                "content": m.content,
            }));
        }

        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "stream": true,
            "messages": messages,
        });

        let resp = self
            .client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        let mut stream = resp.bytes_stream();
        let mut buffer = String::new();

        use futures::StreamExt;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(pos) = buffer.find("\n\n") {
                let event_str = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                for line in event_str.lines() {
                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" {
                            return Ok(());
                        }
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(content) =
                                json["choices"][0]["delta"]["content"].as_str()
                            {
                                let _ = tx.send(content.to_string()).await;
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

// ── Ollama Provider ──────────────────────────────────────────────────

pub struct OllamaProvider {
    endpoint: String,
    model: String,
    client: reqwest::Client,
}

impl OllamaProvider {
    pub fn new(endpoint: String, model: String) -> Self {
        OllamaProvider {
            endpoint,
            model,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for OllamaProvider {
    fn name(&self) -> &str {
        "ollama"
    }

    async fn generate(&self, request: GenerateRequest) -> Result<String> {
        let body = serde_json::json!({
            "model": self.model,
            "system": request.system,
            "prompt": request.messages.last().map(|m| m.content.as_str()).unwrap_or(""),
            "stream": false,
            "options": {
                "temperature": request.temperature,
                "num_predict": request.max_tokens,
            }
        });

        let resp = self
            .client
            .post(format!("{}/api/generate", self.endpoint))
            .json(&body)
            .send()
            .await?;

        let json: serde_json::Value = resp.json().await?;
        let text = json["response"].as_str().unwrap_or("").to_string();

        Ok(text)
    }

    async fn generate_stream(
        &self,
        request: GenerateRequest,
        tx: mpsc::Sender<String>,
    ) -> Result<()> {
        let body = serde_json::json!({
            "model": self.model,
            "system": request.system,
            "prompt": request.messages.last().map(|m| m.content.as_str()).unwrap_or(""),
            "stream": true,
            "options": {
                "temperature": request.temperature,
                "num_predict": request.max_tokens,
            }
        });

        let resp = self
            .client
            .post(format!("{}/api/generate", self.endpoint))
            .json(&body)
            .send()
            .await?;

        let mut stream = resp.bytes_stream();
        use futures::StreamExt;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            let text = String::from_utf8_lossy(&chunk);

            // Ollama streams newline-delimited JSON
            for line in text.lines() {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                    if let Some(response) = json["response"].as_str() {
                        let _ = tx.send(response.to_string()).await;
                    }
                    if json["done"].as_bool() == Some(true) {
                        return Ok(());
                    }
                }
            }
        }

        Ok(())
    }
}

// ── Provider Factory ─────────────────────────────────────────────────

pub fn create_provider(
    provider_name: &str,
    api_key: &str,
    model: &str,
    endpoint: &str,
) -> Box<dyn AiProvider> {
    match provider_name {
        "openai" => Box::new(OpenAiProvider::new(api_key.to_string(), model.to_string())),
        "ollama" => Box::new(OllamaProvider::new(endpoint.to_string(), model.to_string())),
        _ => Box::new(ClaudeProvider::new(api_key.to_string(), model.to_string())),
    }
}
