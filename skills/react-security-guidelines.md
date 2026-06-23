# React Security Guidelines

Essa skill contém regras críticas para desenvolvimento React seguro.
**SEMPRE APLIQUE ESSAS REGRAS** ao codificar componentes de interface:

1. **Evite `dangerouslySetInnerHTML`**: Nunca use isso com dados do usuário sem antes passar por um sanitizador (como `dompurify`).
2. **Prevenção de XSS**: Todas as variáveis injetadas via `{}` já sofrem escape pelo React, mas evite colocar variáveis de estado diretamente em `href` de links sem validar se começam com `http` ou `https`.
3. **State Management Seguro**: Nunca salve tokens JWT sensíveis ou senhas em `localStorage`. Prefira cookies HttpOnly ou mantenha em memória.

Siga estas regras estritamente quando atuar em arquivos `.tsx`.
