# 🐳 Agente do Azure DevOps em Container Docker (Self-Hosted)

Este guia documenta o processo de criação e execução de um agente de build/deploy do Azure DevOps (self-hosted) rodando dentro de um container Docker no servidor Linux local (Ubuntu Server).

## ⚠️ Contexto e Resolução de Erros

A Microsoft **não disponibiliza mais imagens pré-compiladas públicas oficiais** (como `mcr.microsoft.com/azure-pipelines/node-agent:latest`). A recomendação oficial é compilar a imagem localmente usando um `Dockerfile` e um script de inicialização (`start.sh`) que faz o download dinâmico da última versão do agente da Microsoft no momento em que o container é inicializado.

---

## 🛠️ Passo a Passo de Instalação e Execução

Execute os comandos abaixo diretamente no terminal do seu servidor Ubuntu local:

### 1. Criar a pasta do projeto
```bash
mkdir -p ~/azp-agent-in-docker && cd ~/azp-agent-in-docker
```

### 2. Criar o script de inicialização `start.sh`
Este script lê as variáveis de ambiente, baixa os binários oficiais da Microsoft e faz o registro unattended do agente no seu painel.

Copie e cole este bloco inteiro no terminal:
```bash
cat << 'EOF' > start.sh
#!/bin/bash
set -e

if [ -z "${AZP_URL}" ]; then
  echo 1>&2 "error: missing AZP_URL environment variable"
  exit 1
fi

if [ -z "${AZP_TOKEN_FILE}" ]; then
  if [ -z "${AZP_TOKEN}" ]; then
    echo 1>&2 "error: missing AZP_TOKEN environment variable"
    exit 1
  fi

  AZP_TOKEN_FILE="/azp/.token"
  echo -n "${AZP_TOKEN}" > "${AZP_TOKEN_FILE}"
fi

unset AZP_TOKEN

if [ -n "${AZP_WORK}" ]; then
  mkdir -p "${AZP_WORK}"
fi

cleanup() {
  trap "" EXIT

  if [ -e ./config.sh ]; then
    echo "Cleanup. Removing Azure Pipelines agent..."
    while true; do
      ./config.sh remove --unattended --auth "PAT" --token $(cat "${AZP_TOKEN_FILE}") && break
      echo "Retrying in 30 seconds..."
      sleep 30
    done
  fi
}

export VSO_AGENT_IGNORE="AZP_TOKEN,AZP_TOKEN_FILE"

echo "1. Obtendo o pacote do agente correspondente da Microsoft..."

AZP_AGENT_PACKAGES=$(curl -LsS \
    -u user:$(cat "${AZP_TOKEN_FILE}") \
    -H "Accept:application/json" \
    "${AZP_URL}/_apis/distributedtask/packages/agent?platform=${TARGETARCH}&top=1")

AZP_AGENT_PACKAGE_LATEST_URL=$(echo "${AZP_AGENT_PACKAGES}" | jq -r ".value[0].downloadUrl")

if [ -z "${AZP_AGENT_PACKAGE_LATEST_URL}" ] || [ "${AZP_AGENT_PACKAGE_LATEST_URL}" == "null" ]; then
  echo 1>&2 "error: could not determine a matching Azure Pipelines agent"
  echo 1>&2 "check that account '${AZP_URL}' is correct and the token is valid"
  exit 1
fi

echo "2. Baixando e extraindo o agente..."
curl -LsS "${AZP_AGENT_PACKAGE_LATEST_URL}" | tar -xz & wait $!

source ./env.sh

trap "cleanup; exit 0" EXIT
trap "cleanup; exit 1" INT TERM

echo "3. Configurando o agente com a organização..."
./config.sh --unattended \
  --agent "${AZP_AGENT_NAME:-$(hostname)}" \
  --url "${AZP_URL}" \
  --auth "PAT" \
  --token $(cat "${AZP_TOKEN_FILE}") \
  --pool "${AZP_POOL:-Default}" \
  --work "${AZP_WORK:-_work}" \
  --replace \
  --acceptTeeEula & wait $!

echo "4. Executando o agente..."
chmod +x ./run.sh
./run.sh "$@" & wait $!
EOF
```

Adicione permissão de execução ao script:
```bash
chmod +x start.sh
```

### 3. Criar o `Dockerfile`
O `Dockerfile` prepara o ambiente do Ubuntu (22.04 LTS), instala ferramentas fundamentais para builds (curl, git, zip/unzip, libicu) e adiciona a Azure CLI.

Copie e cole este bloco inteiro no terminal:
```bash
cat << 'EOF' > Dockerfile
FROM ubuntu:22.04

ENV TARGETARCH="linux-x64"
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get upgrade -y && apt-get install -y \
    curl \
    git \
    jq \
    libicu70 \
    unzip \
    zip \
    ca-certificates

RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash

WORKDIR /azp/

COPY ./start.sh ./
RUN chmod +x ./start.sh

ENV AGENT_ALLOW_RUNASROOT="true"

ENTRYPOINT [ "./start.sh" ]
EOF
```

### 4. Compilar a Imagem localmente
Compile a imagem no servidor:
```bash
docker build -t azp-agent:local .
```

### 5. Executar o Container do Agente
Rode o container passando suas variáveis de ambiente:

```bash
docker run -d \
  -e AZP_URL="https://dev.azure.com/sua-organizacao" \
  -e AZP_TOKEN="seu-token-pat-aqui" \
  -e AZP_POOL="Default" \
  -e AZP_AGENT_NAME="ubuntu-server-local" \
  --name azdevops-agent \
  -v /var/run/docker.sock:/var/run/docker.sock \
  azp-agent:local
```

> 💡 **Nota de Segurança:** O mapeamento do socket do Docker (`-v /var/run/docker.sock:/var/run/docker.sock`) é opcional e serve para permitir que as pipelines de build criem ou manipulem outros containers Docker a partir do agente.
