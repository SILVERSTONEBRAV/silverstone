use axum::http::HeaderValue;
use reqwest::Url;
use std::{env, net::SocketAddr};

#[derive(Clone)]
pub struct Config {
    pub listen_addr: SocketAddr,
    pub allowed_origins: Vec<HeaderValue>,
    pub supabase_url: Option<String>,
    pub supabase_publishable_key: Option<String>,
    pub openai_api_key: Option<String>,
    pub openai_model: String,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let listen_addr = match env::var("SILVERSTONE_LISTEN_ADDR") {
            Ok(value) => value.parse::<SocketAddr>().map_err(|_| {
                "SILVERSTONE_LISTEN_ADDR must be a socket address such as 127.0.0.1:8787".to_owned()
            })?,
            Err(_) => match env::var("PORT") {
                Ok(port) => format!("0.0.0.0:{port}")
                    .parse::<SocketAddr>()
                    .map_err(|_| "PORT must be a valid TCP port".to_owned())?,
                Err(_) => "127.0.0.1:8787"
                    .parse::<SocketAddr>()
                    .expect("the built-in local address is valid"),
            },
        };

        let origins = env::var("SILVERSTONE_ALLOWED_ORIGINS")
            .unwrap_or_else(|_| "https://silverstoneb.vercel.app,http://localhost:5173".to_owned());
        let allowed_origins = origins
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(|origin| {
                origin
                    .parse::<HeaderValue>()
                    .map_err(|_| format!("Invalid origin in SILVERSTONE_ALLOWED_ORIGINS: {origin}"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        if allowed_origins.is_empty() {
            return Err("SILVERSTONE_ALLOWED_ORIGINS must contain at least one origin".to_owned());
        }

        let supabase_url = optional_env("SILVERSTONE_SUPABASE_URL");
        let supabase_publishable_key = optional_env("SILVERSTONE_SUPABASE_PUBLISHABLE_KEY");
        if supabase_url.is_some() != supabase_publishable_key.is_some() {
            return Err("Set both SILVERSTONE_SUPABASE_URL and SILVERSTONE_SUPABASE_PUBLISHABLE_KEY, or leave both unset".to_owned());
        }
        let supabase_url = supabase_url
            .map(|value| validate_supabase_url(&value))
            .transpose()?;

        let openai_model = optional_env("OPENAI_MODEL").unwrap_or_else(|| "gpt-6-astra".to_owned());
        if openai_model.len() > 100 || openai_model.chars().any(char::is_whitespace) {
            return Err("OPENAI_MODEL must be a model ID without whitespace".to_owned());
        }

        Ok(Self {
            listen_addr,
            allowed_origins,
            supabase_url,
            supabase_publishable_key,
            openai_api_key: optional_env("OPENAI_API_KEY"),
            openai_model,
        })
    }
}

fn optional_env(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn validate_supabase_url(value: &str) -> Result<String, String> {
    let parsed =
        Url::parse(value).map_err(|_| "SILVERSTONE_SUPABASE_URL must be a valid URL".to_owned())?;
    let is_local = matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "::1"));
    if parsed.scheme() != "https" && !(parsed.scheme() == "http" && is_local) {
        return Err(
            "SILVERSTONE_SUPABASE_URL must use HTTPS (HTTP is allowed only for localhost)"
                .to_owned(),
        );
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(
            "SILVERSTONE_SUPABASE_URL cannot include a query string or fragment".to_owned(),
        );
    }
    if parsed.path() != "/" || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(
            "SILVERSTONE_SUPABASE_URL must be a project base URL without a path or credentials"
                .to_owned(),
        );
    }
    Ok(value.trim_end_matches('/').to_owned())
}
