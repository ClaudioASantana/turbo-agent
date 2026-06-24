import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

/**
 * Autentica um usuário comparando as credenciais fornecidas
 * com as variáveis de ambiente configuradas.
 *
 * Variáveis de ambiente necessárias:
 *   DB_USER      — nome de usuário esperado
 *   DB_PASS_HASH — hash bcrypt da senha (gerado com bcrypt.hash)
 *
 * @param {string} inputUser     - Usuário fornecido na tentativa de login
 * @param {string} inputPassword - Senha fornecida na tentativa de login
 * @returns {Promise<boolean>} true se autenticado, false caso contrário
 */
export async function authenticate(inputUser, inputPassword) {
  const dbUser = process.env.DB_USER;
  const dbPassHash = process.env.DB_PASS_HASH;

  if (!dbUser || !dbPassHash) {
    throw new Error(
      'Credenciais não configuradas. Defina DB_USER e DB_PASS_HASH no arquivo .env'
    );
  }

  const userMatch = inputUser === dbUser;
  const passMatch = await bcrypt.compare(inputPassword, dbPassHash);

  // Log seguro: registra apenas o usuário, NUNCA a senha ou o hash
  console.log(
    `[auth] Tentativa de login para usuário "${inputUser}": ${
      userMatch && passMatch ? 'SUCESSO' : 'FALHA'
    }`
  );

  return userMatch && passMatch;
}

// Execução direta apenas para fins de demonstração
// Em produção, remova ou proteja este bloco
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const testUser = process.env.TEST_USER ?? '';
  const testPass = process.env.TEST_PASS ?? '';

  authenticate(testUser, testPass)
    .then((ok) => {
      console.log('[auth] Resultado:', ok ? 'Autenticado' : 'Não autenticado');
      process.exit(ok ? 0 : 1);
    })
    .catch((err) => {
      console.error('[auth] Erro:', err.message);
      process.exit(2);
    });
}
