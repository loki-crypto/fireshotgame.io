import { render } from "preact";
import { App } from "./app/App";
import { sfx } from "./game/audio/Sfx";
import { settings } from "./app/settings";
import "@fontsource/jersey-10/400.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/hud.css";
import "./styles/terminal.css";

sfx.setVolume(settings.value.volume);
render(<App />, document.getElementById("app")!);
