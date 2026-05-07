"use strict";
const electron = require("electron");
function encodeAssetPath(relativePath) {
  return relativePath.split("/").filter(Boolean).map((segment) => encodeURIComponent(segment)).join("/");
}
const companionAPI = {
  getCompanionConfig: () => electron.ipcRenderer.invoke("config:get-companion"),
  getStatesConfig: () => electron.ipcRenderer.invoke("config:get-states"),
  assetUrl: (relativePath) => `companion-asset:///${encodeAssetPath(relativePath)}`
};
electron.contextBridge.exposeInMainWorld("companionAPI", companionAPI);
