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
        // window.alert(reply);
    });

    document.querySelector('button#reconnect').addEventListener('click', async () => {
        const reply = await invoke("reconnect");
    })

    // document.querySelector('button#get-playlists').addEventListener('click', async (e) => {
    //     const reply = await invoke("pl");
    //     console.log(reply);
    // })
});
