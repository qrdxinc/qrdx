// qrdx/core, as react-scripts 4 builds it: the SVG markup of the design.
import { toSVGString } from "qrdx/core";
import design from "./design.json";

window.qrdxResult = () => toSVGString(design);
