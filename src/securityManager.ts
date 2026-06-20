import pc from "picocolors";
import { getConfig } from "./config";
import { checkPermission } from "./permissions";
import { hasSecrets, detectSecrets, formatSecretsWarning } from "./secretsDetector";
import { auditPermissionDenied, auditSecretDetected, auditUserDecision } from "./audit";

export interface SecurityAuthorization {
  approved: boolean;
  reason?: string;
  userMessage?: string;
}

export class SecurityManager {
  /**
   * Evaluates a tool call for permissions and secret detection.
   * Prompts the user if approval is required.
   */
  public static async authorize(toolName: string, args: any, isSubagent: boolean): Promise<SecurityAuthorization> {
    const permCheck = checkPermission(toolName);

    if (!permCheck.allowed) {
      if (!isSubagent) console.log(pc.red(`\n[Bloqueado] ${permCheck.reason}`));
      auditPermissionDenied(toolName, permCheck.reason || "Blocked by config");
      return {
        approved: false,
        reason: "PERMISSION_DENIED",
        userMessage: `Tool '${toolName}' failed: [PERMISSION_DENIED] ${permCheck.reason}`
      };
    }

    if (permCheck.requiresApproval) {
      if (isSubagent) {
        return {
          approved: false,
          reason: "SUBAGENT_DENIED",
          userMessage: `Tool '${toolName}' failed: Subagents are NOT allowed to use tools that require approval.`
        };
      }

      // Secrets detection before approval
      const argsString = JSON.stringify(args || {});
      if (getConfig().secretsDetection && hasSecrets(argsString)) {
        const secrets = detectSecrets(argsString);
        const warning = formatSecretsWarning(secrets);
        console.log(pc.red(`\n${warning}`));
        auditSecretDetected(toolName, secrets.map(s => s.patternName).join(", "));
        
        if (getConfig().secretsBlockWrite) {
          console.log(pc.red("[Bloqueado] Operação cancelada devido à detecção de credenciais."));
          return {
            approved: false,
            reason: "SECRETS_DETECTED",
            userMessage: `Tool '${toolName}' failed: [PERMISSION_DENIED] Secrets detected in arguments. Config blocks writing secrets.`
          };
        }
      }

      // Verifica se já temos uma permissão concedida no cache
      const { isPermissionGranted } = await import("./permissions");
      let approved = isPermissionGranted(toolName, args);

      if (!approved) {
         const { requestToolPermission } = await import("./promptUser");
         approved = await requestToolPermission(toolName, args);
      }
      
      auditUserDecision(toolName, approved, args);
      if (!approved) {
        console.log(pc.yellow("[Ação Negada]"));
        return {
          approved: false,
          reason: "USER_DENIED",
          userMessage: `Tool '${toolName}' failed: User denied permission.`
        };
      }
    }

    return { approved: true };
  }
}
