# Análise de `src/securityManager.ts`

## Visão geral
`src/securityManager.ts` é a camada de controle de acesso e salvaguardas do Turbo-Agent. Ele atua como um interceptor que valida cada chamada de ferramenta antes de sua execução, aplicando regras de permissão e detecção de vazamentos.

## Bloco Único — `SecurityManager.authorize`
A classe possui um único método estático `authorize` que executa as seguintes etapas:

1. **Checagem de Permissão (`checkPermission`)**:
   - Valida se a ferramenta é permitida.
   - Se bloqueada, a operação é abortada e o evento é auditado (`auditPermissionDenied`).

2. **Tratamento de Subagentes**:
   - Ferramentas que exigem aprovação humana são **estritamente proibidas** para subagentes.
   - Isso evita que subagentes tomem decisões críticas ou executem ações perigosas sem supervisão direta.

3. **Detecção de Segredos (`secretsDetector`)**:
   - Se a detecção estiver ativa (`secretsDetection`), analisa a string JSON dos argumentos.
   - Se segredos forem encontrados, imprime um aviso vermelho e audita o evento (`auditSecretDetected`).
   - Se `secretsBlockWrite` estiver ativo, a operação é cancelada imediatamente.

4. **Aprovação Humana (HITL)**:
   - Verifica cache de permissões concedidas (`isPermissionGranted`).
   - Se não houver permissão, solicita a aprovação do usuário via terminal (`requestToolPermission`).
   - A decisão final é auditada (`auditUserDecision`).

**Responsabilidade:** garantir que nenhuma ferramenta perigosa seja executada sem permissão ou exponha dados sensíveis.

## Onde a complexidade está концентrada
- A lógica é linear, mas a dependência de múltiplos módulos (`config`, `permissions`, `secretsDetector`, `audit`, `promptUser`) torna este o ponto de convergência de toda a governança do agente.

## Sinais de risco
- **Cache de Permissão**: O cache pode gerar falsos positivos se a chave de permissão for fraca.
- **Limitação de Subagentes**: Proibir toda aprovação humana para subagentes pode reduzir a utilidade de subagentes em tarefas complexas.
- **Detecção Reativa**: A detecção de segredos ocorre no momento da chamada; raramente falha se o segredo for deformado.

## Leitura prática
O arquivo é bem estruturado. A lógica sinaliza claramente distinguidas entre permitido, configuração requerida e ação do usuário.

## Resumo em uma frase
`src/securityManager.ts` é o "gatekeeper" do sistema, integrando permissões, detecção de segredos e aprovação humana.