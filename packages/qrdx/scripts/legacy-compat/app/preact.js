// qrdx/preact, as webpack 4 builds it with react-scripts 4's Babel setup.
import { h, render } from "preact";
import { QRCodeSVG } from "qrdx/preact";
import design from "./design.json";

const container = document.createElement("div");
document.body.appendChild(container);
render(h(QRCodeSVG, design), container);
window.qrdxResult = () => container.innerHTML;
