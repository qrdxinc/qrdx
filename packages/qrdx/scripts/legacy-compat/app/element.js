// qrdx/element/define, as react-scripts 4 builds it: importing it registers
// <qrdx-code>, which draws into its shadow root.
import "qrdx/element/define";
import design from "./design.json";

const element = document.createElement("qrdx-code");
element.props = design;
document.body.appendChild(element);
window.qrdxResult = () =>
  element.shadowRoot ? element.shadowRoot.innerHTML : "no shadow root";
