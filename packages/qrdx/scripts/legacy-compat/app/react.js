// The React entry (qrdx), as react-scripts 4 builds it: <QRCodeSVG> rendered
// with React 17's react-dom.

import { QRCodeSVG } from "qrdx";
import React from "react";
import ReactDOM from "react-dom";
import design from "./design.json";

const container = document.createElement("div");
document.body.appendChild(container);
ReactDOM.render(React.createElement(QRCodeSVG, design), container);
window.qrdxResult = () => container.innerHTML;
