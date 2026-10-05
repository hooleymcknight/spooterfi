/** GET PLAYLISTS **/

// put this commented function into lib.rs:
// -----

// tauri::async_runtime::spawn(async move {
//     let plbody = get_playlist_info(&token.to_string())
//     .await.expect("playlist fetch failed");

//     println!("{}", plbody);
// });

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