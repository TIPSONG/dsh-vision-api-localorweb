window.__ModuleLoader__.load({
  id: "dsh-vision-api-localorweb",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// dsh-vision-api-localorweb/src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var inject = ["slots", "settingsScope"];
var NAMESPACE = "vision-api";
var COPY = {
  title: "\u53EF\u63A5\u5165\u8BC6\u56FE\u6A21\u578B API",
  intro: "\u914D\u7F6E\u672C\u5730\u8BC6\u56FE\u6A21\u578B\u63A5\u53E3\u540E\uFF0C\u52A9\u624B\u8BC6\u522B\u56FE\u7247\u65F6\u4F1A\u8C03\u7528\u5B83\u3002\u63A5\u53E3\u5730\u5740\u7559\u7A7A\u5219\u4E0D\u4F7F\u7528\u8BC6\u56FE\u6A21\u578B\u3002",
  baseUrlLabel: "\u63A5\u53E3\u5730\u5740",
  baseUrlHint: "OpenAI \u517C\u5BB9\u63A5\u53E3\u7684 base URL\uFF0C\u7559\u7A7A\u8868\u793A\u4E0D\u542F\u7528\u8BC6\u56FE\u6A21\u578B\u3002",
  baseUrlPlaceholder: "\u7559\u7a7a\u5219\u4e0d\u542f\u7528\u8bc6\u56fe\u6a21\u578b",
  modelLabel: "\u6A21\u578B\u540D",
  modelHint: "\u5982 LM Studio \u91CC\u52A0\u8F7D\u7684\u6A21\u578B ID\u3002",
  modelPlaceholder: "\u7559\u7a7a\u5219\u7528\u9ed8\u8ba4\u6a21\u578b",
  apiKeyLabel: "API Key\uFF08\u53EF\u9009\uFF09",
  apiKeyHint: "\u672C\u5730\u670D\u52A1\u901A\u5E38\u65E0\u9700\u586B\u5199\uFF1B\u7559\u7A7A\u5219\u4E0D\u53D1\u9001\u9274\u6743\u5934\u3002",
  apiKeyPlaceholder: "\u7559\u7A7A\u5219\u4E0D\u53D1\u9001\u9274\u6743\u5934",
  save: "\u4FDD\u5B58",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  saved: "\u5DF2\u4FDD\u5B58",
  saveFailed: "\u4FDD\u5B58\u5931\u8D25"
};
function normalizeValue(value) {
  if (typeof value !== "object" || value === null) return { baseUrl: "", model: "", apiKey: "" };
  const v = value;
  return {
    baseUrl: typeof v.baseUrl === "string" ? v.baseUrl : "",
    model: typeof v.model === "string" ? v.model : "",
    apiKey: typeof v.apiKey === "string" ? v.apiKey : ""
  };
}
function useSettingsValue(scope) {
  const React = require("react");
  const snapshot = React.useSyncExternalStore(
    (cb) => scope.subscribe(cb),
    () => scope.getSnapshot()
  );
  return normalizeValue(snapshot && snapshot.value);
}
function VisionSettingsPage(props) {
  const React = require("react");
  const scope = props.scope;
  const current = useSettingsValue(scope);
  const [baseUrl, setBaseUrl] = React.useState(current.baseUrl);
  const [model, setModel] = React.useState(current.model);
  const [apiKey, setApiKey] = React.useState(current.apiKey);
  const [status, setStatus] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => {
    if (loaded) return;
    if (scope.getSnapshot().status === "ready") {
      const v = normalizeValue(scope.getSnapshot().value);
      setBaseUrl(v.baseUrl);
      setModel(v.model);
      setApiKey(v.apiKey);
      setLoaded(true);
    }
  }, [scope, loaded]);
  const save = () => {
    setStatus(COPY.saving);
    Promise.all([
      scope.set("baseUrl", baseUrl.trim()),
      scope.set("model", model.trim()),
      scope.set("apiKey", apiKey.trim())
    ]).then(() => setStatus(COPY.saved)).catch(() => setStatus(COPY.saveFailed));
  };
  const field = (id, label, hint, placeholder, value, onChange, secret) => React.createElement(
    "label",
    { key: id, style: fieldStyle },
    React.createElement("div", { style: labelStyle }, label),
    React.createElement("input", {
      type: secret ? "password" : "text",
      value,
      placeholder,
      autoComplete: "off",
      spellCheck: false,
      onChange: (e) => onChange(e.target.value),
      style: inputStyle
    }),
    React.createElement("div", { style: hintStyle }, hint)
  );
  return React.createElement(
    "div",
    { style: pageStyle },
    React.createElement("h2", { style: headingStyle }, COPY.title),
    React.createElement("p", { style: introStyle }, COPY.intro),
    field("baseUrl", COPY.baseUrlLabel, COPY.baseUrlHint, COPY.baseUrlPlaceholder, baseUrl, setBaseUrl, false),
    field("model", COPY.modelLabel, COPY.modelHint, COPY.modelPlaceholder, model, setModel, false),
    field("apiKey", COPY.apiKeyLabel, COPY.apiKeyHint, COPY.apiKeyPlaceholder, apiKey, setApiKey, true),
    React.createElement(
      "div",
      { style: rowStyle },
      React.createElement("button", { onClick: save, style: buttonStyle }, COPY.save),
      React.createElement("span", { style: statusStyle }, status)
    )
  );
}
var pageStyle = { padding: "16px 4px", maxWidth: "560px" };
var headingStyle = { fontSize: "18px", margin: "0 0 4px" };
var introStyle = { fontSize: "13px", color: "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.95))", margin: "0 0 16px", lineHeight: 1.6 };
var fieldStyle = { display: "block", marginBottom: "14px" };
var labelStyle = { fontSize: "13px", fontWeight: 600, marginBottom: "6px" };
var inputStyle = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.4))", background: "var(--dsw-alias-bg-layer-3, transparent)", color: "var(--dsw-alias-label-primary, inherit)", fontSize: "14px" };
var hintStyle = { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.9))", marginTop: "4px" };
var rowStyle = { display: "flex", alignItems: "center", marginTop: "20px" };
var buttonStyle = { padding: "8px 18px", borderRadius: "6px", border: "none", background: "var(--dsw-alias-brand-primary, #4f46e5)", color: "#ffffff", cursor: "pointer", fontSize: "14px" };
var statusStyle = { marginLeft: "12px", fontSize: "13px", color: "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.95))" };
function apply(ctx) {
  const scope = ctx.settingsScope.bind({ namespace: NAMESPACE });
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      { name: "settings.section", id: "vision-api", order: 30, label: COPY.title },
      (props) => {
        const React = require("react");
        return React.createElement(VisionSettingsPage, { ...props, scope });
      }
    )
  );
}

    return module.exports;
  }
});

