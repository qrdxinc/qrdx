// qrdx/vanilla, as react-scripts 4 builds it: the code drawn into a <div>.
import { createQRCode } from "qrdx/vanilla";
import design from "./design.json";

const container = document.createElement("div");
document.body.appendChild(container);
createQRCode(container, design);
window.qrdxResult = () => container.innerHTML;
