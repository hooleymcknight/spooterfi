use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sha2::{Digest, Sha256};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_oauth::OauthConfig;
use reqwest::Client;
use keyring_core::{set_default_store, unset_default_store, Entry, Result as KeyringResult};
use tauri::Manager;
use std::sync::Mutex;

const CLIENT_ID: &str = "10ceb1c3d434474e9b9e679295692fef";
const OAUTH_PORT: u16 = 8888;
const REDIRECT_URI: &str = "http://127.0.0.1:8888/";
const TOKEN_API: &str = "https://accounts.spotify.com/api/token";

const SCOPES: &[&str] = &[
    "user-read-currently-playing", // track details + progress bar time
    "user-read-playback-state", // track details, active device info, playback controls current state
    "user-modify-playback-state", // modify playback controls
    "user-library-read", // liked songs?
    "user-library-modify", // like this song
    "user-read-recently-played", // ...recently played lol
    "playlist-read-private", // is song on a specific playlist?
    "playlist-read-collaborative", // is song on a specific collab playlist?
    "playlist-modify-private", // edit a private playlist
];

const KEYRING_SERVICE: &str = "com.hollyn.spooterfi-v2";
const KEYRING_USERNAME: &str = "spotify-refresh-token";

#[derive(Default)]
struct TokenState {
    access_token: String,
    expires_in: u64,
}

// *heavy guitar*
// ... RUN.
// *heavier guitar*

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init())
        .invoke_handler(tauri::generate_handler![greet, connect_spotify])
        .setup(|app| {
            let store = windows_native_keyring_store::Store::new().unwrap();
            set_default_store(store);

            app.manage(Mutex::new(AppState::default()));
            
            let _ = check_refresh(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// the commands and other such shit

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn connect_spotify(app: tauri::AppHandle) -> String {
    let pkce_obj = pkce();
    // println!("Challenge: {}", pkce_obj.challenge);
    let auth_url = build_auth_url(&pkce_obj);
    // println!("auth url {:?}", auth_url);

    let config = OauthConfig {
        // Attempt these ports in order to avoid conflicts
        ports: Some(vec![OAUTH_PORT]),
        // The HTML string response displayed in the user's browser after auth
        response: Some("OAuth process completed. You can close this window.".into()),
        ..Default::default()
    };

    let cloned_state = pkce_obj.state.clone();
    let cloned_verifier = pkce_obj.verifier.clone();
    let cloned_app = app.clone();

    println!("before oauth start with config");
    tauri_plugin_oauth::start_with_config(config, move |url| {
        // Handle the captured OAuth URL (e.g., extract the code)
        println!("inside of oauth.");
        let parsed_url = reqwest::Url::parse(&url)
        .expect("could not parse url");
        let mut code: Option<String> = None;
        let mut state: Option<String> = None;

        for (key, value) in parsed_url.query_pairs() {
            if key == "code" {
                code = Some(value.to_string());
            }

            if key == "state" {
                state = Some(value.to_string());
            }
        }

        if let Some(s) = state {
            if s == cloned_state {
                if let Some(c) = code {
                    // println!("code is: \n {}", c);

                    let verifier = cloned_verifier.clone();
                    let app = cloned_app.clone();

                    tauri::async_runtime::spawn(async move {
                        let body = exchange_code(&c, &verifier)
                        .await.expect("Token exchange failed.");

                        // dbg!(&body.refresh_token);

                        let access_token = &body.access_token;
                        // println!("at: {}", access_token);
                        if let Some(refresh_token) = &body.refresh_token {
                            // do something with the token
                            store_tokens(&refresh_token.to_string());
                        }

                        tauri_plugin_oauth::cancel(OAUTH_PORT);

                        // ------
                        // GET-PLAYLIST-INFO
                        // function goes here
                        // ------
                    });
                }
                else {
                    println!("there is no code");
                }
            }
            else {
                println!("State mismatch.");
            }
        }
        else {
            println!("No state from Spotify.");
        }
    })
    .expect("Failed to start OAuth server");

    let opener = app.opener();
    opener.open_url(auth_url, None::<&str>).expect("failed to open browser");
    "pong".to_string()
}

struct PkceStruct {
    verifier: String,
    challenge: String,
    state: String,
}

fn pkce() -> PkceStruct {
    let verifier_bytes: [u8; 32] = rand::random();
    let verifier: String = URL_SAFE_NO_PAD.encode(verifier_bytes);

    let vs_bytes = verifier.as_bytes();
    let hashed_verifier_bytes = Sha256::digest(vs_bytes);
    let challenge: String = URL_SAFE_NO_PAD.encode(hashed_verifier_bytes);

    let state_bytes: [u8; 32] = rand::random();
    let state: String = URL_SAFE_NO_PAD.encode(state_bytes);

    PkceStruct {
        verifier,
        challenge,
        state,
    }
}

fn build_auth_url(pkce_obj: &PkceStruct) -> String { // Result<reqwest::Url, Box<dyn std::error::Error>> {
    let base_url: &str = "https://accounts.spotify.com/authorize";

    let params = [
        ("client_id", CLIENT_ID),
        ("response_type", "code"),
        ("redirect_uri", REDIRECT_URI),
        ("code_challenge_method", "S256"),
        ("code_challenge", &pkce_obj.challenge),
        ("state", &pkce_obj.state),
        ("scope", &SCOPES.join(" ")),
    ];

    let url = reqwest::Url::parse_with_params(base_url, &params).expect("bad auth url");

    url.to_string()
}

#[derive(Debug, serde::Deserialize)]
struct ExchangeCode {
    access_token: String,
    token_type: String,
    scope: String,
    expires_in: u64,
    refresh_token: Option<String>
}

async fn exchange_code(code: &str, verifier: &str) -> Result<ExchangeCode, reqwest::Error> {
    let client = Client::new();
    let params = [
        ("grant_type", "authorization_code"),
        ("redirect_uri", REDIRECT_URI), ("client_id", CLIENT_ID),
        ("code_verifier", verifier), ("code", code),
    ];

    let res = client
        .post(TOKEN_API)
        .form(&params)
        .send()
        .await?;

    // CHECK THIS STATUS before proceeding, I believe
    // println!("Status: {}", res.status());
    Ok(res.json::<ExchangeCode>().await?)
}

async fn exchange_refresh(refresh_token: &str) -> Result<ExchangeCode, reqwest::Error> {
    let client = Client::new();
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", CLIENT_ID),
    ]

    let res = client
        .post(TOKEN_API)
        .form(&params)
        .send()
        .await?;

    // CHECK THIS STATUS before proceeding, I believe
    // println!("Status: {}", res.status());
    Ok(res.json::<ExchangeCode>().await?)
}

fn check_refresh(app: tauri::AppHandle) -> KeyringResult<()> {
    println!("check refresh function");
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USERNAME)?;

    // dbg!(entry.get_password());
    
    if let Ok(refresh_token) = entry.get_password() {
        println!("there IS a refresh token");
        // dbg!(&refresh_token);
        let body = exchange_refresh(&refresh_token)
        .await.expect("Token exchange failed.");
        // return Ok(&body.access_token);
        // set state here
    }
    else {
        println!("no rt");
        let pong = connect_spotify(app);
        println!("{}", pong);
        // return Ok("Login started");
    }
    //
    Ok(())

}

fn store_tokens(refresh_token: &str) -> KeyringResult<()> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USERNAME)?;
    println!("after store entry.");
    // no need to check current refresh or if it even exists.
    // just set it.
    entry.set_password(refresh_token);
    //
    Ok(())
}