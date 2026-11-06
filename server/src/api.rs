use crate::config::Config;
use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
struct AppState {
    config: Config,
    http: Client,
    rate_limit: Arc<Mutex<HashMap<String, RateWindow>>>,
}

struct RateWindow {
    started_at: Instant,
    requests: u8,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

#[derive(Serialize)]
struct ReadinessResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
    features: ReadinessFeatures,
}

#[derive(Serialize)]
struct ReadinessFeatures {
    supabase_auth: bool,
    openai_responses: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AssistantRequest {
    message: String,
}

#[derive(Serialize)]
struct AssistantResponse {
    answer: String,
    model: String,
}

#[derive(Deserialize)]
struct SupabaseUser {
    id: String,
}

#[derive(Serialize)]
struct CurrentUserResponse {
    user_id: String,
}

#[derive(Serialize)]
struct ErrorEnvelope {
    error: ErrorDetails,
}

#[derive(Serialize)]
struct ErrorDetails {
    code: &'static str,
    message: &'static str,
}

struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: &'static str,
}

impl ApiError {
    fn new(status: StatusCode, code: &'static str, message: &'static str) -> Self {
        Self {
            status,
            code,
            message,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response<Body> {
        (
            self.status,
            Json(ErrorEnvelope {
                error: ErrorDetails {
                    code: self.code,
                    message: self.message,
                },
            }),
        )
            .into_response()
    }
}

pub fn router(config: Config) -> Result<Router, String> {
    let http = Client::builder()
        .timeout(Duration::from_secs(55))
        .build()
        .map_err(|error| format!("Could not initialize the HTTP client: {error}"))?;
    let origins = config.allowed_origins.clone();
    let state = AppState {
        config,
        http,
        rate_limit: Arc::new(Mutex::new(HashMap::new())),
    };

    Ok(Router::new()
        .route("/health", get(health))
        .route("/ready", get(readiness))
        .route("/v1/me", get(current_user))
        .route("/v1/assistant/respond", post(assistant_response))
        .with_state(state)
        .layer(DefaultBodyLimit::max(16 * 1024))
        .layer(
            CorsLayer::new()
                .allow_origin(origins)
                .allow_methods([axum::http::Method::GET, axum::http::Method::POST])
                .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]),
        )
        .layer(TraceLayer::new_for_http()))
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "silverstone-api",
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn readiness(State(state): State<AppState>) -> Json<ReadinessResponse> {
    let supabase_auth = state.config.supabase_url.is_some();
    let openai_responses = state.config.openai_api_key.is_some();
    Json(ReadinessResponse {
        status: if supabase_auth && openai_responses {
            "ready"
        } else {
            "degraded"
        },
        service: "silverstone-api",
        version: env!("CARGO_PKG_VERSION"),
        features: ReadinessFeatures {
            supabase_auth,
            openai_responses,
        },
    })
}

async fn current_user(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<CurrentUserResponse>, ApiError> {
    let user = authenticate(&state, &headers).await?;
    Ok(Json(CurrentUserResponse { user_id: user.id }))
}

async fn assistant_response(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<AssistantRequest>,
) -> Result<Json<AssistantResponse>, ApiError> {
    let user = authenticate(&state, &headers).await?;
    if !allow_request(&state.rate_limit, &user.id)? {
        return Err(ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "rate_limited",
            "You have reached the short-term AI request limit. Wait a minute and try again.",
        ));
    }

    let message = request.message.trim();
    if message.is_empty() || message.chars().count() > 4_000 {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid_message",
            "Message must contain between 1 and 4000 characters.",
        ));
    }

    let api_key = state.config.openai_api_key.as_deref().ok_or_else(|| {
        ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "ai_not_configured",
            "Cloud AI is not configured on the Silverstone API server yet.",
        )
    })?;

    let response = state
        .http
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key)
        .json(&json!({
            "model": state.config.openai_model,
            "instructions": "You are Silverstone, a thoughtful personal assistant. You can answer the current message but have no access to the user's files, messages, accounts, memory, or the live web unless the current message includes that information. Do not claim that you completed an action or accessed an account. Do not request passwords, API keys, or authentication codes. Be concise, useful, and clear about uncertainty.",
            "input": message,
            "max_output_tokens": 700,
            "store": false
        }))
        .send()
        .await
        .map_err(|_| ApiError::new(
            StatusCode::BAD_GATEWAY,
            "ai_unavailable",
            "Silverstone could not reach the AI provider. Try again shortly.",
        ))?;

    if !response.status().is_success() {
        let status = response.status();
        tracing::warn!(upstream_status = %status, "OpenAI Responses API request failed");
        return Err(ApiError::new(
            StatusCode::BAD_GATEWAY,
            "ai_provider_error",
            "The AI provider could not complete this request. Check the server key, model, and account quota.",
        ));
    }

    let body = response.json::<Value>().await.map_err(|_| {
        ApiError::new(
            StatusCode::BAD_GATEWAY,
            "ai_invalid_response",
            "Silverstone received an unreadable response from the AI provider.",
        )
    })?;
    let answer = extract_output_text(&body).ok_or_else(|| {
        ApiError::new(
            StatusCode::BAD_GATEWAY,
            "ai_empty_response",
            "The AI provider returned no text. Try asking in a different way.",
        )
    })?;

    Ok(Json(AssistantResponse {
        answer,
        model: state.config.openai_model.clone(),
    }))
}

async fn authenticate(state: &AppState, headers: &HeaderMap) -> Result<SupabaseUser, ApiError> {
    let supabase_url = state.config.supabase_url.as_deref().ok_or_else(|| {
        ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "auth_not_configured",
            "Supabase Auth is not configured on the Silverstone API server yet.",
        )
    })?;
    let publishable_key = state
        .config
        .supabase_publishable_key
        .as_deref()
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "auth_not_configured",
                "Supabase Auth is not configured on the Silverstone API server yet.",
            )
        })?;
    let token = bearer_token(headers)?;

    let response = state
        .http
        .get(format!("{supabase_url}/auth/v1/user"))
        .header("apikey", publishable_key)
        .bearer_auth(token)
        .timeout(Duration::from_secs(12))
        .send()
        .await
        .map_err(|_| {
            ApiError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "auth_provider_unavailable",
                "Silverstone could not verify the sign-in session. Try again shortly.",
            )
        })?;

    if response.status() == StatusCode::UNAUTHORIZED || response.status() == StatusCode::FORBIDDEN {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "invalid_session",
            "Your sign-in session is missing or expired. Sign in again and retry.",
        ));
    }
    if !response.status().is_success() {
        tracing::warn!(upstream_status = %response.status(), "Supabase Auth verification failed");
        return Err(ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "auth_provider_unavailable",
            "Silverstone could not verify the sign-in session. Try again shortly.",
        ));
    }

    let user = response.json::<SupabaseUser>().await.map_err(|_| {
        ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "auth_invalid_response",
            "Silverstone received an invalid response while verifying sign-in.",
        )
    })?;
    if user.id.is_empty() {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "invalid_session",
            "Your sign-in session is missing or expired. Sign in again and retry.",
        ));
    }
    Ok(user)
}

fn bearer_token(headers: &HeaderMap) -> Result<&str, ApiError> {
    let value = headers
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok());
    let Some(value) = value else {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "missing_session",
            "Sign in to Silverstone before using cloud AI.",
        ));
    };
    let Some((scheme, token)) = value.split_once(' ') else {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "invalid_session",
            "Your sign-in session is invalid. Sign in again and retry.",
        ));
    };
    let token = token.trim();
    if !scheme.eq_ignore_ascii_case("bearer") || token.is_empty() || token.len() > 8_192 {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "invalid_session",
            "Your sign-in session is invalid. Sign in again and retry.",
        ));
    }
    Ok(token)
}

fn allow_request(
    limits: &Mutex<HashMap<String, RateWindow>>,
    user_id: &str,
) -> Result<bool, ApiError> {
    let now = Instant::now();
    let mut limits = limits.lock().map_err(|_| {
        ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "rate_limiter_unavailable",
            "Silverstone is temporarily unavailable. Try again shortly.",
        )
    })?;

    if limits.len() > 1_000 {
        limits.retain(|_, window| now.duration_since(window.started_at) < Duration::from_secs(120));
    }

    let window = limits.entry(user_id.to_owned()).or_insert(RateWindow {
        started_at: now,
        requests: 0,
    });
    if now.duration_since(window.started_at) >= Duration::from_secs(60) {
        window.started_at = now;
        window.requests = 0;
    }
    if window.requests >= 12 {
        return Ok(false);
    }
    window.requests += 1;
    Ok(true)
}

fn extract_output_text(body: &Value) -> Option<String> {
    if let Some(text) = body
        .get("output_text")
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
    {
        return Some(text.trim().to_owned());
    }

    let mut text = String::new();
    for item in body.get("output")?.as_array()? {
        for content in item
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            if content.get("type").and_then(Value::as_str) == Some("output_text") {
                if let Some(fragment) = content.get("text").and_then(Value::as_str) {
                    if !text.is_empty() {
                        text.push('\n');
                    }
                    text.push_str(fragment);
                }
            }
        }
    }
    (!text.trim().is_empty()).then(|| text.trim().to_owned())
}
