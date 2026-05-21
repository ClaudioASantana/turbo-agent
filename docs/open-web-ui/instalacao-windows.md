# Instalando o Open WebUI no Docker Desktop do Windows

Instalar o Open WebUI no Windows usando o Docker Desktop é um processo direto. Aqui está o passo a passo de como fazer isso:

## 1. Pré-requisitos

* Certifique-se de que o **Docker Desktop** está instalado e rodando no seu Windows. Se não estiver, você pode baixá-lo no [site oficial](https://www.docker.com/products/docker-desktop/).
* (Recomendado) Nas configurações do Docker Desktop, verifique se a opção de usar o **WSL 2** (Windows Subsystem for Linux) está ativada, pois oferece melhor performance.

## 2. Rodando o comando de instalação

Abra o **PowerShell** ou o **Prompt de Comando** (cmd) no seu Windows. O comando que você vai usar depende se você já tem o Ollama instalado no seu computador ou não.

### Opção A: Se você usa o Ollama no seu Windows (Mais comum)

Se você instalou o Ollama diretamente no seu Windows e quer que o Open WebUI se conecte a ele, copie e cole este comando:

```bash
docker run -d -p 3000:8080 --add-host=host.docker.internal:host-gateway -v open-webui:/app/backend/data --name open-webui --restart always ghcr.io/open-webui/open-webui:main
```

*(A parte `--add-host=...` é o que permite que o container do Docker consiga "enxergar" o Ollama rodando no seu sistema Windows).*

### Opção B: Se você não usa o Ollama localmente

Se você vai usar o Open WebUI para se conectar a APIs externas (como OpenAI, Anthropic, etc.) ou o Ollama está em outro servidor, use este comando:

```bash
docker run -d -p 3000:8080 -v open-webui:/app/backend/data --name open-webui --restart always ghcr.io/open-webui/open-webui:main
```

## 3. Acessando o Open WebUI

1. Após rodar o comando, o Docker vai baixar a imagem (isso pode levar alguns minutos dependendo da sua internet) e iniciar o container.
2. Você poderá ver o container "open-webui" rodando no painel do seu Docker Desktop.
3. Abra o seu navegador e acesse: **[http://localhost:3000](http://localhost:3000)**

Ao acessar pela primeira vez, você precisará criar uma conta (o primeiro usuário criado se torna automaticamente o administrador do sistema).

### Dica: Onde os dados ficam salvos?

O trecho `-v open-webui:/app/backend/data` do comando garante que seus chats, usuários e configurações fiquem salvos em um "volume" do Docker. Isso significa que mesmo se você reiniciar o computador ou atualizar o container do Open WebUI, você não perderá seus dados.
