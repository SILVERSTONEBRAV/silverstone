mod api;
mod config;

use config::Config;
use std::error::Error;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // Vite reads only VITE_* values. The Rust API reads its server-only values
    // from the same ignored local file for development, or from host env vars.
    let _ = dotenvy::from_filename(".env.local").or_else(|_| dotenvy::dotenv());

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("silverstone_server=info,tower_http=info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .init();

    let config = Config::from_env().map_err(std::io::Error::other)?;
    let address = config.listen_addr;
    let app = api::router(config).map_err(std::io::Error::other)?;
    let listener = tokio::net::TcpListener::bind(address).await?;

    tracing::info!(%address, "Silverstone API listening");
    axum::serve(listener, app).await?;
    Ok(())
}
