"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptUser = promptUser;
exports.confirmAction = confirmAction;
exports.requestToolPermission = requestToolPermission;
const prompts_1 = require("@inquirer/prompts");
const picocolors_1 = __importDefault(require("picocolors"));
const permissions_1 = require("./permissions");
const path_1 = __importDefault(require("path"));
async function promptUser(question) {
    return await (0, prompts_1.input)({ message: picocolors_1.default.cyan(picocolors_1.default.bold(question)) });
}
async function confirmAction(message, defaultAnswer = false) {
    return await (0, prompts_1.confirm)({ message, default: defaultAnswer });
}
async function requestToolPermission(toolName, args) {
    const choices = [
        { name: "Sim (Aprovar apenas esta vez)", value: "yes" },
        { name: "Não (Negar)", value: "no" },
        { name: `Aprovar SEMPRE para a ferramenta '${toolName}' (Perigoso)`, value: "always_tool" }
    ];
    const targetFile = args?.file || args?.targetFile || args?.path;
    if (targetFile) {
        const absPath = path_1.default.resolve(targetFile);
        const dir = path_1.default.dirname(absPath) + path_1.default.sep;
        choices.splice(2, 0, { name: `Aprovar SEMPRE para o arquivo "${path_1.default.basename(absPath)}"`, value: "always_file" });
        choices.splice(3, 0, { name: `Aprovar SEMPRE para o diretório "${dir}"`, value: "always_dir" });
    }
    const answer = await (0, prompts_1.select)({
        message: picocolors_1.default.yellow(`⚠️ O Agente quer executar '${toolName}'. O que você deseja fazer?`),
        choices
    });
    if (answer === "no")
        return false;
    if (answer === "always_tool")
        (0, permissions_1.grantPermission)(toolName);
    if (answer === "always_file" && targetFile)
        (0, permissions_1.grantPermission)(toolName, targetFile, false);
    if (answer === "always_dir" && targetFile) {
        const dir = path_1.default.dirname(path_1.default.resolve(targetFile)) + path_1.default.sep;
        (0, permissions_1.grantPermission)(toolName, dir, true);
    }
    return true;
}
