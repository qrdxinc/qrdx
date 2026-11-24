// qrdx/vue, as webpack 4 builds it with react-scripts 4's Babel setup.

import { QRCodeSVG } from "qrdx/vue";
import { createApp, h } from "vue";
import design from "./design.json";

const container = document.createElement("div");
document.body.appendChild(container);
createApp({ render: () => h(QRCodeSVG, design) }).mount(container);
window.qrdxResult = () => container.innerHTML;
