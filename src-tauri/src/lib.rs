use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sha2::{Digest, Sha256};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_oauth::OauthConfig;
use reqwest::Client;

const CLIENT_ID: &str = "10ceb1c3d434474e9b9e679295692fef";
const REDIRECT_URI: &str = "http://127.0.0.1:8888/";

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

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn ping(app: tauri::AppHandle) -> String {
    let pkce_obj = pkce();
    // println!("Challenge: {}", pkce_obj.challenge);
    let auth_url = build_auth_url(&pkce_obj);
    // println!("auth url {:?}", auth_url);

    let config = OauthConfig {
        // Attempt these ports in order to avoid conflicts
        ports: Some(vec![8888]),
        // The HTML string response displayed in the user's browser after auth
        response: Some("OAuth process completed. You can close this window.".into()),
        ..Default::default()
    };

    let cloned_state = pkce_obj.state.clone();
    let cloned_verifier = pkce_obj.verifier.clone();
    let cloned_app = app.clone();

    tauri_plugin_oauth::start_with_config(config, move |url| {
        // Handle the captured OAuth URL (e.g., extract the code)
        
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
                        let token = serde_json::from_str::<serde_json::Value>(&body).unwrap()["access_token"].as_str().unwrap().to_string();
                        // println!("{}", body);
                        println!("token: {}", token);

                        // tauri::async_runtime::spawn(async move {
                        //     let plbody = get_playlist_info(&token.to_string())
                        //     .await.expect("playlist fetch failed");

                        //     println!("{}", plbody);
                        // });
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init())
        .invoke_handler(tauri::generate_handler![greet, ping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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

async fn exchange_code(code: &str, verifier: &str) -> Result<String, reqwest::Error> {
    let client = Client::new();
    let params = [
        ("grant_type", "authorization_code"), ("code", code),
        ("redirect_uri", REDIRECT_URI), ("client_id", CLIENT_ID), ("code_verifier", verifier)
    ];

    let res = client
        .post("https://accounts.spotify.com/api/token")
        .form(&params)
        .send()
        .await?;

    println!("Status: {}", res.status());
    Ok(res.text().await?)
}


/** GET PLAYLISTS **/

async fn get_json(client: &Client, at: &str, url: &str) -> Option<serde_json::Value> {
    let res = client.get(url).bearer_auth(at).send().await.ok()?;
    let status = res.status();
    if !status.is_success() {
        println!("{} -> {}", status, url);
        return None;
    }
    serde_json::from_str(&res.text().await.ok()?).ok()
}

async fn get_playlist_info(at: &str) -> Result<String, reqwest::Error> {
    let client = Client::new();
    let mut songs: Vec<serde_json::Value> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // 1. every page of your playlists
    let mut playlists: Vec<(String, String)> = Vec::new();
    let mut next = Some("https://api.spotify.com/v1/me/playlists?limit=50".to_string());
    while let Some(url) = next {
        let Some(page) = get_json(&client, at, &url).await else { break };
        for p in page["items"].as_array().into_iter().flatten() {
            if let (Some(id), Some(name)) = (p["id"].as_str(), p["name"].as_str()) {
                playlists.push((id.to_string(), name.to_string()));
            }
        }
        next = page["next"].as_str().map(|s| s.to_string());
    }
    println!("found {} playlists", playlists.len());

    // 2. every page of songs in each playlist
    for (id, name) in &playlists {
        let mut next = Some(format!(
            "https://api.spotify.com/v1/playlists/{}/items?limit=50",
            id
        ));
        while let Some(url) = next {
            let Some(page) = get_json(&client, at, &url).await else {
                println!("skipped playlist: {}", name);
                break;
            };
            for entry in page["items"].as_array().into_iter().flatten() {
                // Spotify renamed "track" to "item"; check both
                let item = if entry["item"].is_null() { &entry["track"] } else { &entry["item"] };
                if item["type"].as_str() != Some("track") {
                    continue; // skips podcast episodes and empty entries
                }
                let (Some(title), Some(artist)) =
                    (item["name"].as_str(), item["artists"][0]["name"].as_str())
                else {
                    continue;
                };
                if seen.insert((title.to_lowercase(), artist.to_lowercase())) {
                    songs.push(serde_json::json!({ "title": title, "artist": artist }));
                }
            }
            next = page["next"].as_str().map(|s| s.to_string());
        }
    }

    std::fs::write("../library.json", serde_json::to_string_pretty(&songs).unwrap()).unwrap();
    Ok(format!("saved {} songs to library.json", songs.len()))
}