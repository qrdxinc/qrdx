// qrdx/svelte, as webpack 4 builds it with react-scripts 4's Babel setup.
// The action is a plain function, so the app calls it the way Svelte does.
import { qrcode } from "qrdx/svelte";
import design from "./design.json";

const container = document.createElement("div");
document.body.appendChild(container);
const action = qrcode(container, design);
action.update({ ...design });
window.qrdxResult = () => container.innerHTML;
