const { invoke } = window.__TAURI__.core;

let greetInputEl;
let greetMsgEl;

async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    greetMsgEl.textContent = await invoke("greet", { name: greetInputEl.value });
}

window.addEventListener("DOMContentLoaded", () => {
    // greetInputEl = document.querySelector("#greet-input");
    // greetMsgEl = document.querySelector("#greet-msg");
    // document.querySelector("#greet-form").addEventListener("submit", (e) => {
    //     e.preventDefault();
    //     greet();
    // });

    document.querySelector('button#connect-spotify').addEventListener('click', async () => {
        const reply = await invoke("connect_spotify");
        console.log(reply);
        if (reply === "true") {
            const data = await invoke("get_now_playing");
            console.log(data.item);
            document.querySelector('#title').textContent = data.item.name;
            document.querySelector('#artist').textContent = data.item.artists[0].name;
        }
    });

    document.querySelector('button#reconnect').addEventListener('click', async () => {
        const reply = await invoke("reconnect");
    });

    document.querySelector('button#get-now-playing').addEventListener('click', async () => {
        const data = await invoke("get_now_playing");
        console.log(data.item);
        document.querySelector('#title').textContent = data.item.name;
        document.querySelector('#artist').textContent = data.item.artists[0].name;
    });

    // document.querySelector('button#get-playlists').addEventListener('click', async (e) => {
    //     const reply = await invoke("pl");
    //     console.log(reply);
    // });
});
