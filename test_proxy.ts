import OpenAI from "openai";

async function run() {
    const openai = new OpenAI({
        baseURL: "http://localhost:2099/v1",
        apiKey: "mnfst_fY7SnPpnYLiuS4IUIs2FVszbr8o_FgdL0i42JyozAgE"
    });

    const response = await openai.chat.completions.create({
        model: "claude-3-5-sonnet-20241022",
        messages: [
            { role: "system", content: `Você é o Explorador (Agentic RAG). Entenda o pedido do usuário e vasculhe os arquivos usando list_files ou read_file para encontrar onde a mudança deve ocorrer. Quando tiver os caminhos exatos, chame finish_task reportando os caminhos encontrados.
Se a tarefa for complexa, use a ferramenta list_skills para ver se há diretrizes específicas do projeto, E use list_knowledge_items para ler regras e lições aprendidas de sessões anteriores antes de seguir.
SE O USUÁRIO APENAS MANDAR UMA SAUDAÇÃO (ex: "olá"), responda amigavelmente em texto puro e NÃO chame ferramentas.
SE O USUÁRIO FIZER UMA PERGUNTA QUE EXIGE DADOS DA INTERNET (ex: clima, notícias, cotações), VOCÊ ESTÁ ESTRITAMENTE PROIBIDO de dizer que não tem acesso. VOCÊ DEVE OBRIGATORIAMENTE chamar a ferramenta "web_search" ou "invoke_browser_subagent" para buscar a resposta no Google/DuckDuckGo antes de responder.` },
            { role: "user", content: "Pede para o Poeta_Sertanejo criar um pequeno verso explicando o que é a linguagem TypeScript." }
        ],
        tools: [{
            type: "function",
            function: {
                name: "finish_task",
                description: "Finish the task",
                parameters: { type: "object", properties: { result: { type: "string" } } }
            }
        }],
        stream: true
    });

    for await (const chunk of response) {
        console.log("CHUNK:", JSON.stringify(chunk));
    }
}
run().catch(console.error);
